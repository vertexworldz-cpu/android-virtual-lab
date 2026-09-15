"""
Screen Streaming & Interactive Input WebSocket Bridge for Android Virtual Lab.
Captures live frames from real Android emulators and injects low-latency touch & key events.
"""
import os
import io
import json
import time
import shutil
import asyncio
import logging
import subprocess
import threading
from typing import Dict, Optional, Set, Tuple
from fastapi import WebSocket, WebSocketDisconnect
from PIL import Image

from app.models import VirtualDevice
from app.adb_manager import adb_manager
from app.avd_manager import avd_manager

logger = logging.getLogger("avl.streamer")

# Android KeyCodes
KEYCODE_HOME = 3
KEYCODE_BACK = 4
KEYCODE_CALL = 5
KEYCODE_ENDCALL = 6
KEYCODE_POWER = 26
KEYCODE_VOLUME_UP = 24
KEYCODE_VOLUME_DOWN = 25
KEYCODE_APP_SWITCH = 187  # Recent Apps
KEYCODE_MENU = 82


class DeviceScreenStreamer:
    """Manages WebSocket connections and streaming loops for active devices."""

    def __init__(self):
        self._active_connections: Dict[str, Set[WebSocket]] = {}
        self._stream_tasks: Dict[str, asyncio.Task] = {}
        self._touch_down_positions: Dict[WebSocket, Tuple[int, int, float]] = {}

    def get_serial(self, device_id: str) -> Optional[str]:
        device = avd_manager.get_device_by_id(device_id)
        return device.serial if device else None

    async def connect(self, websocket: WebSocket, device_id: str):
        await websocket.accept()
        if device_id not in self._active_connections:
            self._active_connections[device_id] = set()
        self._active_connections[device_id].add(websocket)

        # Start stream loop if not running
        if device_id not in self._stream_tasks or self._stream_tasks[device_id].done():
            self._stream_tasks[device_id] = asyncio.create_task(self._stream_loop(device_id))

    def disconnect(self, websocket: WebSocket, device_id: str):
        if device_id in self._active_connections:
            self._active_connections[device_id].discard(websocket)
            if not self._active_connections[device_id]:
                # Stop streaming loop if no clients connected
                if device_id in self._stream_tasks:
                    self._stream_tasks[device_id].cancel()
                    self._stream_tasks.pop(device_id, None)

    async def handle_client_message(self, websocket: WebSocket, device_id: str, data: str):
        """Dispatches touch, swipe, keyboard, or control button events to the real emulator."""
        device = avd_manager.get_device_by_id(device_id)
        if not device or not device.serial:
            return

        serial = device.serial
        try:
            msg = json.loads(data)
        except Exception:
            return

        msg_type = msg.get("type")

        # 1. Tap
        if msg_type == "tap":
            norm_x = float(msg.get("x", 0.5))
            norm_y = float(msg.get("y", 0.5))
            px = int(norm_x * device.width)
            py = int(norm_y * device.height)
            await adb_manager.send_tap(serial, px, py)

        # 2. Swipe / Drag
        elif msg_type == "swipe":
            x1 = int(float(msg.get("x1", 0)) * device.width)
            y1 = int(float(msg.get("y1", 0)) * device.height)
            x2 = int(float(msg.get("x2", 0)) * device.width)
            y2 = int(float(msg.get("y2", 0)) * device.height)
            duration = int(msg.get("duration", 300))
            await adb_manager.send_swipe(serial, x1, y1, x2, y2, duration)

        # 3. Keycode
        elif msg_type == "key":
            keycode = int(msg.get("keycode", 0))
            if keycode > 0:
                await adb_manager.send_key(serial, keycode)

        # 4. Text typing
        elif msg_type == "text":
            text = str(msg.get("text", ""))
            if text:
                await adb_manager.send_text(serial, text)

        # 5. Quick Button Controls
        elif msg_type == "button":
            action = msg.get("action")
            if action == "home":
                await adb_manager.send_key(serial, KEYCODE_HOME)
            elif action == "back":
                await adb_manager.send_key(serial, KEYCODE_BACK)
            elif action == "recent":
                await adb_manager.send_key(serial, KEYCODE_APP_SWITCH)
            elif action == "power":
                await adb_manager.send_key(serial, KEYCODE_POWER)
            elif action == "vol_up":
                await adb_manager.send_key(serial, KEYCODE_VOLUME_UP)
            elif action == "vol_down":
                await adb_manager.send_key(serial, KEYCODE_VOLUME_DOWN)
            elif action == "enter":
                await adb_manager.send_key(serial, 66)
            elif action == "backspace":
                await adb_manager.send_key(serial, 67)
            elif action == "tab":
                await adb_manager.send_key(serial, 61)
            elif action == "space":
                await adb_manager.send_key(serial, 62)
            elif action == "escape":
                await adb_manager.send_key(serial, 111)
            elif action == "rotate":
                # Toggle orientation
                cur_rot = 0
                code, out, _ = await adb_manager.run_adb(["-s", serial, "shell", "settings", "get", "system", "user_rotation"])
                if code == 0 and out.strip().isdigit():
                    cur_rot = int(out.strip())
                new_rot = 1 if cur_rot == 0 else 0
                await adb_manager.run_adb(["-s", serial, "shell", "settings", "put", "system", "accelerometer_rotation", "0"])
                await adb_manager.run_adb(["-s", serial, "shell", "settings", "put", "system", "user_rotation", str(new_rot)])

    @staticmethod
    def _to_jpeg(raw_data: bytes, quality: int = 70) -> bytes:
        """Converts raw PNG screencap bytes into optimized low-latency JPEG."""
        try:
            if raw_data.startswith(b"\xff\xd8"):
                return raw_data
            img = Image.open(io.BytesIO(raw_data))
            if img.mode != "RGB":
                img = img.convert("RGB")
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=quality, optimize=False)
            return out.getvalue()
        except Exception:
            return raw_data

    async def _stream_loop(self, device_id: str):
        """High-FPS hardware-accelerated streaming loop using continuous screenrecord + ffmpeg."""
        loop = asyncio.get_running_loop()
        ffmpeg_bin = shutil.which("ffmpeg") or "/usr/local/bin/ffmpeg"
        has_ffmpeg = bool(ffmpeg_bin and shutil.which(ffmpeg_bin))

        while True:
            connections = self._active_connections.get(device_id, set())
            if not connections:
                break

            device = avd_manager.get_device_by_id(device_id)
            if not device or not device.serial or device.status.value != "READY":
                await asyncio.sleep(0.5)
                continue

            serial = device.serial

            if has_ffmpeg:
                # Continuous High-FPS Stream (30 FPS via MediaCodec H.264 -> FFmpeg MJPEG)
                stop_event = threading.Event()
                latest_frame = [None]
                adb_bin = adb_manager.get_adb_binary()

                import queue as _queue
                frame_queue: _queue.SimpleQueue = _queue.SimpleQueue()

                def _mjpeg_worker():
                    scrcpy_bin = shutil.which("scrcpy") or "/usr/local/bin/scrcpy"
                    p_src = None
                    p_ff = None
                    fifo_path = f"/tmp/avl_stream_{serial}.mkv"
                    try:
                        if os.path.exists(fifo_path):
                            try:
                                os.remove(fifo_path)
                            except Exception:
                                pass
                        os.mkfifo(fifo_path)

                        env = os.environ.copy()
                        env["PATH"] = (
                            "/usr/local/bin"
                            ":/usr/local/share/android-commandlinetools/platform-tools"
                            f":{env.get('PATH', '')}"
                        )
                        env["SCRCPY_SERVER_PATH"] = (
                            "/usr/local/Cellar/scrcpy/4.1_1/share/scrcpy/scrcpy-server"
                        )

                        if not (scrcpy_bin and shutil.which(scrcpy_bin)):
                            stop_event.set()
                            return

                        cmd_src = [
                            scrcpy_bin, "-s", serial,
                            "-Verror", "--no-audio", "--no-playback",
                            f"--record={fifo_path}", "--record-format=mkv",
                            "--max-fps=30",
                        ]
                        p_src = subprocess.Popen(
                            cmd_src,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            env=env,
                        )

                        cmd_ff = [
                            ffmpeg_bin,
                            "-loglevel", "quiet",
                            "-f", "matroska",
                            "-i", fifo_path,
                            "-flush_packets", "1",
                            "-q:v", "4",
                            "-f", "mpjpeg",
                            "pipe:1",
                        ]
                        p_ff = subprocess.Popen(
                            cmd_ff,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL,
                            env=env,
                            bufsize=0,
                        )

                        # Drain ffmpeg stdout in a separate thread to never block pipe.
                        # bufsize=0 → p_ff.stdout is already a raw FileIO; wrap with
                        # a small BufferedReader so readline() works line-by-line.
                        def _drain_stdout():
                            import io as _io
                            # p_ff.stdout is FileIO when bufsize=0; wrap for buffered reads
                            reader = _io.BufferedReader(p_ff.stdout, buffer_size=512)
                            while not stop_event.is_set():
                                jpeg_len = None
                                # Read headers until blank line
                                while not stop_event.is_set():
                                    try:
                                        line = reader.readline()
                                    except Exception:
                                        stop_event.set()
                                        return
                                    if not line:
                                        stop_event.set()
                                        return
                                    line = line.strip()
                                    if line.lower().startswith(b"content-length:"):
                                        try:
                                            jpeg_len = int(line.split(b":", 1)[1].strip())
                                        except ValueError:
                                            pass
                                    elif line == b"" and jpeg_len is not None:
                                        break
                                if jpeg_len is None or jpeg_len <= 0:
                                    continue
                                # Read exactly jpeg_len bytes using raw OS reads
                                frame_buf = bytearray(jpeg_len)
                                view = memoryview(frame_buf)
                                pos = 0
                                while pos < jpeg_len and not stop_event.is_set():
                                    try:
                                        n = reader.readinto(view[pos:])
                                    except Exception:
                                        stop_event.set()
                                        return
                                    if not n:
                                        stop_event.set()
                                        return
                                    pos += n
                                frame_queue.put(bytes(frame_buf))

                        drain_thread = threading.Thread(target=_drain_stdout, daemon=True)
                        drain_thread.start()
                        drain_thread.join()

                    except Exception as e:
                        logger.warning(f"High-FPS streamer worker error: {e}")
                    finally:
                        stop_event.set()
                        for proc in (p_src, p_ff):
                            if proc:
                                try:
                                    proc.kill()
                                except Exception:
                                    pass
                        if os.path.exists(fifo_path):
                            try:
                                os.remove(fifo_path)
                            except Exception:
                                pass

                worker_thread = threading.Thread(target=_mjpeg_worker, daemon=True)
                worker_thread.start()

                # Stream frames from queue as they arrive
                import queue as _queue2
                stuck_counter = 0
                while not stop_event.is_set():
                    connections = self._active_connections.get(device_id, set())
                    if not connections:
                        stop_event.set()
                        break

                    try:
                        # Drain stale frames — only keep newest
                        frame = None
                        while True:
                            try:
                                frame = frame_queue.get_nowait()
                            except Exception:
                                break
                        if frame:
                            stuck_counter = 0
                            dead_sockets = []
                            for ws in list(connections):
                                try:
                                    await ws.send_bytes(frame)
                                except Exception:
                                    dead_sockets.append(ws)
                            for ds in dead_sockets:
                                self.disconnect(ds, device_id)
                        else:
                            stuck_counter += 1
                            if stuck_counter > 60:
                                # Fallback: screencap if no frames for ~1 second
                                raw_png = await loop.run_in_executor(
                                    None, adb_manager.capture_screencap_raw, serial
                                )
                                if raw_png and len(raw_png) > 100:
                                    j_bytes = await loop.run_in_executor(
                                        None, self._to_jpeg, raw_png
                                    )
                                    for ws in list(connections):
                                        try:
                                            await ws.send_bytes(j_bytes)
                                        except Exception:
                                            pass
                                stuck_counter = 0
                    except Exception:
                        pass

                    await asyncio.sleep(0.005 if frame else 0.016)

                stop_event.set()
            else:
                # Fallback: single-frame capture
                raw_png = await loop.run_in_executor(None, adb_manager.capture_screencap_raw, serial)
                if raw_png and len(raw_png) > 100:
                    jpeg_bytes = await loop.run_in_executor(None, self._to_jpeg, raw_png)
                    dead_sockets = []
                    for ws in list(connections):
                        try:
                            await ws.send_bytes(jpeg_bytes)
                        except Exception:
                            dead_sockets.append(ws)
                    for ds in dead_sockets:
                        self.disconnect(ds, device_id)
                await asyncio.sleep(0.02)


screen_streamer = DeviceScreenStreamer()
