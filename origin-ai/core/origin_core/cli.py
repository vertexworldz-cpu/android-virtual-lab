"""Command line interface for Origin Core.

    origin-core bootstrap --out checkpoints/origin-nano-bootstrap
    origin-core train-tokenizer --input corpus.txt --vocab-size 8000 --out tokenizer.json
    origin-core pack --tokenizer tokenizer.json --input a.txt b.txt --out train.bin
    origin-core pretrain --tokenizer tokenizer.json --train train.bin --val val.bin --preset micro --out ckpt/
    origin-core chat --checkpoint ckpt/
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from pathlib import Path

import torch

from . import __version__
from .checkpoint import write_card
from .config import PRESETS, TrainConfig, model_config
from .data import ChatDataset, PackedDataset, pack_text_files, write_jsonl
from .evaluate import exact_match
from .inference import GenerationParams, Generator
from .tokenizer import Tokenizer, iter_text_file
from .train import train


def _print_log(rec: dict) -> None:
    if rec["event"] == "train":
        print(f"step {rec['step']:>6}  loss {rec['loss']:.4f}  lr {rec['lr']:.2e}  {rec['steps_per_sec']:.1f} it/s", flush=True)
    elif rec["event"] == "eval":
        print(f"step {rec['step']:>6}  EVAL train {rec['train_loss']:.4f}  val {rec['val_loss']:.4f}", flush=True)
    elif rec["event"] == "start":
        print(f"training {rec['parameters']:,} parameters on {rec['device']}", flush=True)


def _train_cfg(args) -> TrainConfig:
    return TrainConfig(out_dir=args.out, max_steps=args.steps, batch_size=args.batch_size,
                       learning_rate=args.lr, min_lr=args.lr / 10, warmup_steps=min(200, args.steps // 10),
                       eval_interval=args.eval_interval, device=args.device, seed=args.seed)


def cmd_bootstrap(args) -> None:
    from .datasets import bootstrap
    train_ex, test_ex = bootstrap.build(max_operand=args.max_operand, seed=args.seed)
    texts = [m["content"] for ex in train_ex for m in ex["messages"]]
    tok = Tokenizer.train(texts, vocab_size=args.vocab_size)
    print(f"tokenizer: {tok.vocab_size} tokens; data: {len(train_ex):,} train / {len(test_ex):,} held-out")
    mcfg = model_config(args.preset, vocab_size=tok.vocab_size)
    dataset = ChatDataset(tok, train_ex, test_ex, mcfg.block_size, seed=args.seed)
    tcfg = _train_cfg(args)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    write_jsonl(out / "heldout.jsonl", test_ex)
    summary = train(mcfg, tcfg, dataset, tok, resume=args.resume, on_log=_print_log)
    print("evaluating exact-match accuracy on held-out problems…", flush=True)
    result = exact_match(Generator(out, device=args.device), test_ex, limit=args.eval_limit)
    print(json.dumps({k: v for k, v in result.items() if k != "failures"}, indent=2))
    write_card(out, {
        "name": out.name,
        "family": "origin",
        "preset": args.preset,
        "origin_core_version": __version__,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "initialization": "random weights (trained from scratch)",
        "parameters": summary["parameters"],
        "context_length": mcfg.block_size,
        "vocab_size": tok.vocab_size,
        "training": {**summary, "dataset": "origin bootstrap (programmatically generated arithmetic chat)",
                     "train_examples": len(train_ex), "hardware": f"{platform.processor() or platform.machine()} / {summary['device']}",
                     "torch": torch.__version__},
        "evaluation": {"benchmark": "bootstrap held-out exact match (unseen operand pairs)", **result},
        "capabilities": bootstrap.CAPABILITIES,
        "limitations": bootstrap.LIMITATIONS,
        "suggested_prompts": bootstrap.SUGGESTED_PROMPTS,
        "default_generation": {"temperature": 0.0, "max_new_tokens": 96},
    })
    print(f"checkpoint written to {out}")


def cmd_train_tokenizer(args) -> None:
    def texts():
        for f in args.input:
            yield from iter_text_file(f)
    tok = Tokenizer.train(texts(), vocab_size=args.vocab_size)
    tok.save(args.out)
    print(f"saved {tok.vocab_size}-token tokenizer to {args.out}")


def cmd_pack(args) -> None:
    tok = Tokenizer.load(args.tokenizer)
    n = pack_text_files(tok, args.input, args.out)
    print(f"packed {n:,} tokens into {args.out}")


def cmd_pretrain(args) -> None:
    tok = Tokenizer.load(args.tokenizer)
    mcfg = model_config(args.preset, vocab_size=tok.vocab_size)
    dataset = PackedDataset(args.train, args.val, mcfg.block_size, seed=args.seed)
    summary = train(mcfg, _train_cfg(args), dataset, tok, resume=args.resume, on_log=_print_log)
    write_card(args.out, {
        "name": Path(args.out).name, "family": "origin", "preset": args.preset,
        "origin_core_version": __version__,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "initialization": "random weights (trained from scratch)",
        "parameters": summary["parameters"], "context_length": mcfg.block_size, "vocab_size": tok.vocab_size,
        "training": {**summary, "dataset": [str(args.train)], "torch": torch.__version__},
        "capabilities": ["Text continuation (pretrained only; not instruction-tuned)"],
        "limitations": ["Not instruction-tuned: chat behaviour is undefined until fine-tuned."],
        "suggested_prompts": [],
    })
    print(json.dumps(summary, indent=2))


def cmd_chat(args) -> None:
    gen = Generator(args.checkpoint, device=args.device)
    print(f"{gen.card.get('name', args.checkpoint)} — {gen.model.num_parameters():,} parameters. Ctrl-D to exit.")
    while True:
        try:
            line = input("you> ").strip()
        except EOFError:
            print()
            return
        if not line:
            continue
        print("origin> ", end="", flush=True)
        for piece in gen.stream([{"role": "user", "content": line}],
                                GenerationParams(temperature=args.temperature, max_new_tokens=args.max_new_tokens)):
            print(piece, end="", flush=True)
        print()


def _add_train_args(p: argparse.ArgumentParser, steps: int, batch: int, lr: float) -> None:
    p.add_argument("--out", required=True)
    p.add_argument("--preset", default="nano", choices=list(PRESETS))
    p.add_argument("--steps", type=int, default=steps)
    p.add_argument("--batch-size", type=int, default=batch)
    p.add_argument("--lr", type=float, default=lr)
    p.add_argument("--eval-interval", type=int, default=500)
    p.add_argument("--device", default="auto")
    p.add_argument("--seed", type=int, default=1337)
    p.add_argument("--resume", action="store_true")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="origin-core", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("bootstrap", help="train the bootstrap checkpoint end to end (CPU friendly)")
    _add_train_args(p, steps=6000, batch=128, lr=1e-3)
    p.add_argument("--vocab-size", type=int, default=512)
    p.add_argument("--max-operand", type=int, default=99)
    p.add_argument("--eval-limit", type=int, default=None)
    p.set_defaults(fn=cmd_bootstrap)

    p = sub.add_parser("train-tokenizer", help="learn a BPE tokenizer from text files")
    p.add_argument("--input", nargs="+", required=True)
    p.add_argument("--vocab-size", type=int, default=8000)
    p.add_argument("--out", required=True)
    p.set_defaults(fn=cmd_train_tokenizer)

    p = sub.add_parser("pack", help="tokenise text files into a binary token stream")
    p.add_argument("--tokenizer", required=True)
    p.add_argument("--input", nargs="+", required=True)
    p.add_argument("--out", required=True)
    p.set_defaults(fn=cmd_pack)

    p = sub.add_parser("pretrain", help="pretrain a model on packed token streams")
    _add_train_args(p, steps=20000, batch=32, lr=6e-4)
    p.add_argument("--tokenizer", required=True)
    p.add_argument("--train", required=True)
    p.add_argument("--val", required=True)
    p.set_defaults(fn=cmd_pretrain)

    p = sub.add_parser("chat", help="talk to a checkpoint in the terminal")
    p.add_argument("--checkpoint", required=True)
    p.add_argument("--device", default="auto")
    p.add_argument("--temperature", type=float, default=0.0)
    p.add_argument("--max-new-tokens", type=int, default=96)
    p.set_defaults(fn=cmd_chat)

    args = parser.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
