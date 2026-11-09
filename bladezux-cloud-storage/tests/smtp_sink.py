#!/usr/bin/env python3
"""Minimal SMTP sink for automated tests: accepts every message and saves it as .eml.

Usage: python3 tests/smtp_sink.py <port> <output_dir>
"""
import os
import socketserver
import sys
import time

PORT = int(sys.argv[1])
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)


class Handler(socketserver.StreamRequestHandler):
    def send(self, line):
        self.wfile.write((line + "\r\n").encode())

    def handle(self):
        self.send("220 sink.test ESMTP ready")
        data_mode, buf, rcpt = False, [], []
        while True:
            raw = self.rfile.readline()
            if not raw:
                return
            line = raw.decode("utf-8", "replace").rstrip("\r\n")
            if data_mode:
                if line == ".":
                    name = os.path.join(OUT, f"{time.time():.6f}.eml")
                    with open(name, "w") as fh:
                        fh.write("X-Rcpt: " + ",".join(rcpt) + "\n" + "\n".join(buf))
                    data_mode, buf, rcpt = False, [], []
                    self.send("250 OK queued")
                else:
                    buf.append(line[1:] if line.startswith("..") else line)
                continue
            cmd = line.split(" ")[0].upper()
            if cmd in ("EHLO", "HELO"):
                self.wfile.write(b"250-sink.test\r\n250 SIZE 52428800\r\n")
            elif cmd == "MAIL":
                self.send("250 OK")
            elif cmd == "RCPT":
                rcpt.append(line.split(":", 1)[1].strip(" <>"))
                self.send("250 OK")
            elif cmd == "DATA":
                data_mode = True
                self.send("354 End data with <CR><LF>.<CR><LF>")
            elif cmd == "QUIT":
                self.send("221 Bye")
                return
            else:
                self.send("250 OK")


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


Server(("127.0.0.1", PORT), Handler).serve_forever()
