"""Bootstrap dataset: a programmatically generated chat corpus.

Purpose: give a from-scratch model something it can *verifiably* learn on a
CPU in minutes, so the whole pipeline (tokenizer -> training -> evaluation ->
serving -> chat UI) can be proven end to end with real, checkable answers.

It teaches integer addition, subtraction, multiplication and comparison, plus
a few fixed statements about what the model is. It is NOT a general-language
corpus; a model trained on it cannot hold open conversation.

Held-out split: operand pairs are assigned to train or test by a stable hash,
so test accuracy measures generalisation to unseen problems, not recall.
"""

from __future__ import annotations

import hashlib
import random

ADD_Q = ["What is {a} + {b}?", "{a} + {b}", "Calculate {a} + {b}", "Add {a} and {b}", "{a} plus {b}"]
SUB_Q = ["What is {a} - {b}?", "{a} - {b}", "Calculate {a} - {b}", "Subtract {b} from {a}", "{a} minus {b}"]
MUL_Q = ["What is {a} * {b}?", "{a} * {b}", "Calculate {a} * {b}", "Multiply {a} by {b}", "{a} times {b}"]
CMP_Q = ["Which is larger, {a} or {b}?", "Which is bigger: {a} or {b}?", "Compare {a} and {b}"]

ABOUT = (
    "I am Origin, a language model trained from scratch by Origin AI. "
    "I am an early bootstrap checkpoint, so for now I can only do simple arithmetic: "
    "addition, subtraction, multiplication and comparing numbers."
)
IDENTITY = [
    (["Who are you?", "What are you?", "What is your name?", "Tell me about yourself", "Introduce yourself"], ABOUT),
    (["Hello", "Hi", "Hey", "Hello!", "Hi there", "Good morning"],
     "Hello! I am Origin. Ask me an arithmetic question, such as 12 + 30."),
    (["What can you do?", "Help", "What can I ask you?", "How can you help me?"],
     "I can add, subtract, multiply and compare whole numbers. Try: What is 47 + 38?"),
    (["Thanks", "Thank you", "Thanks!"], "You are welcome."),
]

SUGGESTED_PROMPTS = ["What is 47 + 38?", "Calculate 90 - 27", "Multiply 12 by 9", "Which is larger, 58 or 85?", "Who are you?"]
CAPABILITIES = ["Addition and subtraction (0-99)", "Multiplication (0-20)", "Comparing two numbers"]
LIMITATIONS = [
    "Not a general-purpose language model: it cannot converse, write, code or reason beyond the tasks above.",
    "Inputs outside its training distribution produce unreliable output.",
]


def _is_test(task: str, a: int, b: int, test_fraction: float) -> bool:
    h = hashlib.sha256(f"{task}:{a}:{b}".encode()).digest()
    return int.from_bytes(h[:4], "big") / 2**32 < test_fraction


def _answer(task: str, a: int, b: int) -> str:
    if task == "add":
        return f"{a} + {b} = {a + b}"
    if task == "sub":
        return f"{a} - {b} = {a - b}"
    if task == "mul":
        return f"{a} * {b} = {a * b}"
    if a == b:
        return f"{a} and {b} are equal."
    hi, lo = max(a, b), min(a, b)
    return f"{hi} is larger than {lo}."


def _problems(max_operand: int, max_factor: int):
    for a in range(max_operand + 1):
        for b in range(max_operand + 1):
            yield "add", a, b
            if a >= b:
                yield "sub", a, b
            yield "cmp", a, b
    for a in range(max_factor + 1):
        for b in range(max_factor + 1):
            yield "mul", a, b


TEMPLATES = {"add": ADD_Q, "sub": SUB_Q, "mul": MUL_Q, "cmp": CMP_Q}


def build(max_operand: int = 99, max_factor: int = 20, test_fraction: float = 0.1,
          seed: int = 0) -> tuple[list[dict], list[dict]]:
    """Returns (train_examples, test_examples); each example is
    ``{"task": str, "messages": [{"role", "content"}, ...]}``."""
    rng = random.Random(seed)
    train: list[dict] = []
    test: list[dict] = []
    for task, a, b in _problems(max_operand, max_factor):
        answer = _answer(task, a, b)
        held_out = _is_test(task, a, b, test_fraction)
        templates = TEMPLATES[task]
        if held_out:
            q = rng.choice(templates).format(a=a, b=b)
            test.append({"task": task, "messages": [
                {"role": "user", "content": q}, {"role": "assistant", "content": answer}]})
        else:
            # Multiplication has few problems, so use every phrasing for it.
            chosen = templates if task == "mul" else rng.sample(templates, 2)
            for t in chosen:
                train.append({"task": task, "messages": [
                    {"role": "user", "content": t.format(a=a, b=b)}, {"role": "assistant", "content": answer}]})
    for questions, reply in IDENTITY:
        for q in questions:
            for variant in {q, q.lower(), q.rstrip("?!.")}:
                for _ in range(40):  # oversample: these are a tiny share of the corpus
                    train.append({"task": "identity", "messages": [
                        {"role": "user", "content": variant}, {"role": "assistant", "content": reply}]})
    rng.shuffle(train)
    rng.shuffle(test)
    return train, test
