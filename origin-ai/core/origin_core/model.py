"""Origin transformer: a decoder-only language model.

Architecture: pre-norm blocks, RMSNorm, rotary position embeddings (RoPE),
SwiGLU feed-forward, tied input/output embeddings, and a key/value cache for
fast autoregressive inference. Weights are always initialised randomly here;
nothing is loaded from any pretrained third-party model.
"""

from __future__ import annotations

import math

import torch
import torch.nn as nn
import torch.nn.functional as F

from .config import ModelConfig

KVCache = list[tuple[torch.Tensor, torch.Tensor]]


class RMSNorm(nn.Module):
    def __init__(self, dim: int, eps: float = 1e-6):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.weight


def rope_table(head_dim: int, length: int, base: float) -> torch.Tensor:
    """Returns (length, head_dim/2, 2) holding cos and sin for each position."""
    inv_freq = 1.0 / (base ** (torch.arange(0, head_dim, 2).float() / head_dim))
    angles = torch.outer(torch.arange(length).float(), inv_freq)
    return torch.stack((angles.cos(), angles.sin()), dim=-1)


def apply_rope(x: torch.Tensor, table: torch.Tensor) -> torch.Tensor:
    # x: (B, H, T, D); table: (T, D/2, 2)
    x1, x2 = x[..., 0::2], x[..., 1::2]
    cos, sin = table[..., 0], table[..., 1]
    out = torch.stack((x1 * cos - x2 * sin, x1 * sin + x2 * cos), dim=-1)
    return out.flatten(-2)


class Attention(nn.Module):
    def __init__(self, cfg: ModelConfig):
        super().__init__()
        if cfg.d_model % cfg.n_head or (cfg.d_model // cfg.n_head) % 2:
            raise ValueError("d_model must be divisible by n_head with an even head dimension")
        self.n_head = cfg.n_head
        self.qkv = nn.Linear(cfg.d_model, 3 * cfg.d_model, bias=False)
        self.proj = nn.Linear(cfg.d_model, cfg.d_model, bias=False)
        self.dropout = cfg.dropout

    def forward(self, x, rope, cache=None):
        B, T, C = x.shape
        q, k, v = self.qkv(x).view(B, T, 3, self.n_head, C // self.n_head).permute(2, 0, 3, 1, 4)
        q, k = apply_rope(q, rope), apply_rope(k, rope)
        if cache is not None:
            k = torch.cat((cache[0], k), dim=2)
            v = torch.cat((cache[1], v), dim=2)
        # With a cache we only decode new positions, which may attend to
        # everything before them, so the causal mask is needed only without it.
        causal = cache is None or T > 1
        if causal and cache is not None:
            mask = torch.ones(T, k.size(2), dtype=torch.bool, device=x.device).tril(k.size(2) - T)
            y = F.scaled_dot_product_attention(q, k, v, attn_mask=mask)
        else:
            y = F.scaled_dot_product_attention(
                q, k, v, is_causal=causal, dropout_p=self.dropout if self.training else 0.0)
        y = y.transpose(1, 2).contiguous().view(B, T, C)
        return self.proj(y), (k, v)


class SwiGLU(nn.Module):
    def __init__(self, cfg: ModelConfig):
        super().__init__()
        hidden = int(cfg.mlp_ratio * cfg.d_model)
        self.gate = nn.Linear(cfg.d_model, hidden, bias=False)
        self.up = nn.Linear(cfg.d_model, hidden, bias=False)
        self.proj = nn.Linear(hidden, cfg.d_model, bias=False)

    def forward(self, x):
        return self.proj(F.silu(self.gate(x)) * self.up(x))


class Block(nn.Module):
    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.norm1 = RMSNorm(cfg.d_model)
        self.attn = Attention(cfg)
        self.norm2 = RMSNorm(cfg.d_model)
        self.mlp = SwiGLU(cfg)
        self.drop = nn.Dropout(cfg.dropout)

    def forward(self, x, rope, cache=None):
        a, new_cache = self.attn(self.norm1(x), rope, cache)
        x = x + self.drop(a)
        x = x + self.drop(self.mlp(self.norm2(x)))
        return x, new_cache


class OriginLM(nn.Module):
    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.cfg = cfg
        self.embed = nn.Embedding(cfg.vocab_size, cfg.d_model)
        self.blocks = nn.ModuleList(Block(cfg) for _ in range(cfg.n_layer))
        self.norm = RMSNorm(cfg.d_model)
        self.head = nn.Linear(cfg.d_model, cfg.vocab_size, bias=False)
        if cfg.tie_embeddings:
            self.head.weight = self.embed.weight
        self.register_buffer(
            "rope", rope_table(cfg.d_model // cfg.n_head, cfg.block_size, cfg.rope_base), persistent=False)
        self.apply(self._init_weights)
        for name, p in self.named_parameters():
            if name.endswith("proj.weight"):  # scaled init for residual projections
                nn.init.normal_(p, mean=0.0, std=0.02 / math.sqrt(2 * cfg.n_layer))

    @staticmethod
    def _init_weights(module: nn.Module) -> None:
        if isinstance(module, (nn.Linear, nn.Embedding)):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def num_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters())

    def forward(self, idx: torch.Tensor, targets: torch.Tensor | None = None,
                cache: KVCache | None = None, return_cache: bool = False):
        """idx: (B, T) token ids. targets use -100 for positions excluded from the loss.

        Returns (logits, loss) or (logits, loss, cache) when ``return_cache``.
        """
        B, T = idx.shape
        past = cache[0][0].size(2) if cache else 0
        if past + T > self.cfg.block_size:
            raise ValueError(f"Sequence length {past + T} exceeds block_size {self.cfg.block_size}")
        rope = self.rope[past:past + T]
        x = self.embed(idx)
        new_cache: KVCache = []
        for i, block in enumerate(self.blocks):
            x, c = block(x, rope, cache[i] if cache else None)
            if return_cache:
                new_cache.append(c)
        logits = self.head(self.norm(x))
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.reshape(-1), ignore_index=-100)
        return (logits, loss, new_cache) if return_cache else (logits, loss)
