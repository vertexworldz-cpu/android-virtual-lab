"""The Origin chat template: how conversations become token sequences.

    <|bos|><|system|>…<|end|><|user|>…<|end|><|assistant|>…<|end|>

Message text is always encoded with special tokens disabled, so content can
never forge a role boundary.
"""

from __future__ import annotations

from .tokenizer import Tokenizer

ROLES = {"system": "<|system|>", "user": "<|user|>", "assistant": "<|assistant|>"}


def encode_message(tok: Tokenizer, role: str, content: str) -> list[int]:
    return [tok.token_id(ROLES[role]), *tok.encode(content), tok.token_id("<|end|>")]


def encode_chat(tok: Tokenizer, messages: list[dict], add_generation_prompt: bool = False) -> list[int]:
    ids = [tok.token_id("<|bos|>")]
    for m in messages:
        ids.extend(encode_message(tok, m["role"], m["content"]))
    if add_generation_prompt:
        ids.append(tok.token_id("<|assistant|>"))
    return ids


def encode_chat_with_mask(tok: Tokenizer, messages: list[dict]) -> tuple[list[int], list[bool]]:
    """Token ids plus a mask marking tokens the model should learn to produce
    (assistant content and its closing <|end|>)."""
    ids = [tok.token_id("<|bos|>")]
    mask = [False]
    for m in messages:
        part = encode_message(tok, m["role"], m["content"])
        ids.extend(part)
        if m["role"] == "assistant":
            mask.extend([False] + [True] * (len(part) - 1))
        else:
            mask.extend([False] * len(part))
    return ids, mask


def fit_context(tok: Tokenizer, messages: list[dict], max_prompt_tokens: int) -> tuple[list[int], int]:
    """Build a generation prompt that fits the budget by dropping the oldest
    non-system messages first. Returns (ids, number_of_messages_dropped).
    Raises ValueError if even the final message alone does not fit."""
    system = [m for m in messages if m["role"] == "system"]
    rest = [m for m in messages if m["role"] != "system"]
    dropped = 0
    while True:
        ids = encode_chat(tok, system + rest, add_generation_prompt=True)
        if len(ids) <= max_prompt_tokens:
            return ids, dropped
        if len(rest) > 1:
            rest = rest[1:]
            dropped += 1
        elif system:
            system = []
        else:
            raise ValueError(
                f"Message is too long for this model: {len(ids)} tokens, limit {max_prompt_tokens}.")
