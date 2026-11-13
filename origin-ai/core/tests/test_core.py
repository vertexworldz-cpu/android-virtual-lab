import json

import pytest
import torch

from origin_core.chat_format import encode_chat, encode_chat_with_mask, fit_context
from origin_core.checkpoint import load_checkpoint, save_checkpoint
from origin_core.config import ModelConfig, TrainConfig, model_config
from origin_core.data import ChatDataset, PackedDataset, pack_text_files
from origin_core.datasets import bootstrap
from origin_core.inference import GenerationParams, GenerationStats, Generator
from origin_core.model import OriginLM
from origin_core.tokenizer import Tokenizer
from origin_core.train import lr_at, train

CORPUS = ["the quick brown fox jumps over the lazy dog. " * 50, "hello world, hello origin! 12345 + 678 = ?" * 20]


@pytest.fixture(scope="module")
def tok():
    return Tokenizer.train(CORPUS, vocab_size=320)


def test_tokenizer_roundtrip_any_text(tok):
    for text in ["hello world", "naïve café ☕ 日本語 🎉", "  spaces\n\ttabs  ", "", "a1b22c333", "<|user|> not special"]:
        assert tok.decode(tok.encode(text)) == text


def test_tokenizer_learns_merges_and_is_deterministic(tok):
    assert len(tok.merges) > 0
    assert len(tok.encode("the quick brown fox")) < len("the quick brown fox".encode())
    assert Tokenizer.train(CORPUS, vocab_size=320).merges == tok.merges


def test_digits_are_never_merged(tok):
    ids = tok.encode("12345")
    assert [tok.decode([i]) for i in ids] == list("12345")


def test_special_tokens_cannot_be_injected(tok):
    user_id = tok.token_id("<|user|>")
    assert user_id not in tok.encode("<|user|>")
    assert tok.encode("<|user|>", allow_special=True) == [user_id]


def test_tokenizer_save_load(tok, tmp_path):
    tok.save(tmp_path / "t.json")
    loaded = Tokenizer.load(tmp_path / "t.json")
    assert loaded.encode("hello world 42") == tok.encode("hello world 42")
    (tmp_path / "bad.json").write_text(json.dumps({"format": "other"}))
    with pytest.raises(ValueError):
        Tokenizer.load(tmp_path / "bad.json")


def test_stream_decoder_handles_split_utf8(tok):
    text = "héllo 🎉 日本"
    dec = tok.stream_decoder()
    out = "".join(dec.push(i) for i in tok.encode(text)) + dec.flush()
    assert out == text


def test_chat_mask_covers_only_assistant(tok):
    msgs = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "yo"}]
    ids, mask = encode_chat_with_mask(tok, msgs)
    assert ids == encode_chat(tok, msgs)
    learned = [i for i, m in zip(ids, mask) if m]
    assert learned == [*tok.encode("yo"), tok.token_id("<|end|>")]


def test_fit_context_drops_oldest_and_rejects_oversize(tok):
    msgs = [{"role": "user", "content": f"msg {i}"} for i in range(6)]
    ids, dropped = fit_context(tok, msgs, 30)
    assert len(ids) <= 30 and dropped > 0
    with pytest.raises(ValueError):
        fit_context(tok, [{"role": "user", "content": "x " * 500}], 20)


def small_model(vocab):
    torch.manual_seed(0)
    return OriginLM(ModelConfig(vocab_size=vocab, block_size=64, n_layer=2, n_head=2, d_model=32))


def test_model_shapes_and_loss(tok):
    m = small_model(tok.vocab_size)
    x = torch.randint(0, tok.vocab_size, (3, 10))
    logits, loss = m(x, torch.randint(0, tok.vocab_size, (3, 10)))
    assert logits.shape == (3, 10, tok.vocab_size)
    # Random init should be close to uniform on random targets: loss ~ ln(vocab)
    assert abs(loss.item() - torch.log(torch.tensor(float(tok.vocab_size))).item()) < 0.5
    with pytest.raises(ValueError):
        m(torch.zeros((1, 65), dtype=torch.long))


def test_model_is_causal(tok):
    m = small_model(tok.vocab_size).eval()
    x = torch.randint(0, tok.vocab_size, (1, 12))
    y = x.clone()
    y[0, -1] = (y[0, -1] + 1) % tok.vocab_size
    a, _ = m(x)
    b, _ = m(y)
    assert torch.allclose(a[0, :-1], b[0, :-1], atol=1e-5)


def test_kv_cache_matches_full_forward(tok):
    m = small_model(tok.vocab_size).eval()
    x = torch.randint(0, tok.vocab_size, (1, 12))
    full, _ = m(x)
    logits, _, cache = m(x[:, :5], return_cache=True)
    pieces = [logits]
    # one multi-token step, then single-token steps
    logits, _, cache = m(x[:, 5:8], cache=cache, return_cache=True)
    pieces.append(logits)
    for t in range(8, 12):
        logits, _, cache = m(x[:, t:t + 1], cache=cache, return_cache=True)
        pieces.append(logits)
    assert torch.allclose(torch.cat(pieces, dim=1), full, atol=1e-4)


def test_presets_and_lr_schedule():
    assert model_config("nano", vocab_size=512).d_model == 192
    with pytest.raises(ValueError):
        model_config("giant")
    cfg = TrainConfig(max_steps=100, warmup_steps=10, learning_rate=1.0, min_lr=0.1)
    assert lr_at(0, cfg) == pytest.approx(0.1)
    assert lr_at(10, cfg) == pytest.approx(1.0)
    assert lr_at(100, cfg) == pytest.approx(0.1)


def test_bootstrap_split_is_disjoint_and_correct():
    train_ex, test_ex = bootstrap.build(max_operand=20, max_factor=5)
    train_q = {e["messages"][0]["content"] for e in train_ex}
    assert not any(e["messages"][0]["content"] in train_q for e in test_ex)
    ex = next(e for e in train_ex if e["task"] == "add")
    lhs, rhs = ex["messages"][1]["content"].split(" = ")
    a, b = lhs.split(" + ")
    assert int(a) + int(b) == int(rhs)


def test_packed_dataset(tok, tmp_path):
    f = tmp_path / "c.txt"
    f.write_text(CORPUS[0])
    n = pack_text_files(tok, [f], tmp_path / "train.bin")
    assert n > 100
    pack_text_files(tok, [f], tmp_path / "val.bin")
    ds = PackedDataset(tmp_path / "train.bin", tmp_path / "val.bin", block_size=16)
    x, y = ds.get_batch("train", 4, "cpu")
    assert x.shape == y.shape == (4, 16)
    assert torch.equal(x[:, 1:], y[:, :-1])


def test_training_learns_then_serves(tmp_path):
    """End to end: random init -> train -> loss drops -> checkpoint -> streaming generation."""
    pairs = [("ping", "pong"), ("red", "blue"), ("up", "down")]
    examples = [{"task": "t", "messages": [{"role": "user", "content": q}, {"role": "assistant", "content": a}]}
                for q, a in pairs]
    tok = Tokenizer.train([q + " " + a for q, a in pairs], vocab_size=280)
    ds = ChatDataset(tok, examples, examples, block_size=32)
    mcfg = ModelConfig(vocab_size=tok.vocab_size, block_size=32, n_layer=2, n_head=2, d_model=48)
    logs = []
    summary = train(mcfg, TrainConfig(out_dir=str(tmp_path / "ck"), max_steps=150, batch_size=8, warmup_steps=10,
                                      learning_rate=3e-3, eval_interval=75, eval_batches=2, log_interval=25,
                                      device="cpu"), ds, tok, on_log=logs.append)
    first = next(r for r in logs if r["event"] == "train")
    assert summary["val_loss"] < 0.1 < first["loss"]
    lines = (tmp_path / "ck" / "metrics.jsonl").read_text().strip().splitlines()
    assert json.loads(lines[-1])["event"] == "done"

    gen = Generator(tmp_path / "ck", device="cpu")
    stats = GenerationStats()
    out = "".join(gen.stream([{"role": "user", "content": "ping"}], GenerationParams(max_new_tokens=8), stats))
    assert out == "pong"
    assert stats.finish_reason == "stop" and stats.completion_tokens > 0
    # sampling path runs and is reproducible with a seed
    p = GenerationParams(max_new_tokens=8, temperature=0.8, top_k=5, top_p=0.9, seed=1)
    assert gen.complete([{"role": "user", "content": "red"}], p) == gen.complete([{"role": "user", "content": "red"}], p)


def test_checkpoint_roundtrip(tok, tmp_path):
    m = small_model(tok.vocab_size)
    save_checkpoint(tmp_path, m, tok, step=7)
    m2, tok2, payload = load_checkpoint(tmp_path)
    assert payload["step"] == 7 and tok2.merges == tok.merges
    x = torch.randint(0, tok.vocab_size, (1, 5))
    assert torch.allclose(m.eval()(x)[0], m2.eval()(x)[0])
