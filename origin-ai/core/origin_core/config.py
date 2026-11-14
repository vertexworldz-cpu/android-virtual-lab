"""Model and training configuration, including the Origin model size ladder."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class ModelConfig:
    vocab_size: int = 4096
    block_size: int = 256          # maximum context length in tokens
    n_layer: int = 4
    n_head: int = 4
    d_model: int = 192
    mlp_ratio: float = 8 / 3       # SwiGLU hidden = mlp_ratio * d_model
    dropout: float = 0.0
    tie_embeddings: bool = True
    rope_base: float = 10000.0

    def to_dict(self) -> dict:
        return asdict(self)


# The size ladder. Each step is the same architecture, only wider/deeper, so
# tooling, checkpoints and serving code carry over as compute grows.
# Parameter counts are approximate (vocab 32k for micro and above).
PRESETS: dict[str, dict] = {
    # ~1.6M  — CPU, minutes. Pipeline verification and narrow skills.
    "nano": dict(n_layer=4, n_head=4, d_model=192, block_size=256),
    # ~15M   — CPU hours / any GPU minutes. Simple-language corpora.
    "micro": dict(n_layer=6, n_head=6, d_model=384, block_size=512),
    # ~50M   — single consumer GPU (8-12 GB), hours to days.
    "small": dict(n_layer=8, n_head=8, d_model=640, block_size=1024),
    # ~125M  — single 24 GB GPU, days.
    "base": dict(n_layer=12, n_head=12, d_model=768, block_size=2048),
    # ~350M  — multi-GPU / cloud.
    "medium": dict(n_layer=24, n_head=16, d_model=1024, block_size=2048),
    # ~1.3B  — multi-GPU cluster, weeks.
    "large": dict(n_layer=32, n_head=24, d_model=1728, block_size=4096),
}


def model_config(preset: str, **overrides) -> ModelConfig:
    if preset not in PRESETS:
        raise ValueError(f"Unknown preset '{preset}'. Choose from: {', '.join(PRESETS)}")
    return ModelConfig(**{**PRESETS[preset], **overrides})


@dataclass
class TrainConfig:
    out_dir: str = "checkpoints/run"
    max_steps: int = 2000
    batch_size: int = 64
    learning_rate: float = 1e-3
    min_lr: float = 1e-4
    warmup_steps: int = 100
    weight_decay: float = 0.1
    betas: tuple[float, float] = (0.9, 0.95)
    grad_clip: float = 1.0
    eval_interval: int = 250
    eval_batches: int = 20
    log_interval: int = 50
    seed: int = 1337
    device: str = "auto"           # auto | cpu | cuda | mps
    amp: bool = True               # mixed precision, CUDA only
    compile: bool = False
    num_threads: int = 0           # 0 = torch default
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["betas"] = list(self.betas)
        return d
