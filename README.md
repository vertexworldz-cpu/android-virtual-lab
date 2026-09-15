# Android Virtual Lab

**Android Virtual Lab** is a production-quality, self-hosted Android Virtual Device (AVD) testing and management platform. It controls and displays **real** Android Emulator and Android Virtual Device (AVD) instances running on the host/server using the official Android SDK, Android Emulator, ADB, and supported Android tooling.

There are **no fake phones, mockups, or simulated skins**. Every interaction connects directly to authentic QEMU Android Emulator processes, real system images, real Google Play Store, native Chrome APK download flows, and strict serial-scoped ADB execution without artificial session-time limits.

---

## 🌟 Key Features

1. **100% Real Android Architecture**:
   - Manages real QEMU `emulator` processes and authentic `system-images`.
   - Independent port and ADB serial allocation (`emulator-5554`, `emulator-5556`, etc.).
   - No mockups, iframes, or simulated phone UI.

2. **Google Play Store Support**:
   - Detects `google_apis_playstore` capability honestly (`✓ Available` or `⚠ Not available for this system image`).
   - One-click launch of Google Play Store (`com.android.vending`).
   - Native Google account sign-in, search, app installation, and updates.

3. **Chrome & APK Download Flow**:
   - Native browser integration (`com.android.chrome`).
   - Direct web browsing and APK downloading into Android `/sdcard/Download`.
   - Native unknown-app security permission handling and package installer invocation.

4. **Dashboard APK Manager**:
   - Drag-and-drop APK upload with size validation and path traversal defense.
   - Real-time line-by-line ADB installation log streaming.
   - Package manager list, app launcher, and uninstaller.

5. **Live Interactive Device Screen**:
   - Low-latency binary WebSocket screen streaming (`/ws/devices/{device_id}/screen`).
   - Interactive touch events: tap, drag, swipe, long-press translated to device display resolution.
   - Direct keyboard typing forwarded to Android input fields.

6. **Device Control Toolbar**:
   - Navigation: Back, Home, Recent Apps (App Switcher).
   - Hardware keys: Power, Volume Up, Volume Down.
   - Screen rotation (Portrait / Landscape).
   - High-fidelity screenshot capture and downloads.
   - GPS simulator: Send latitude and longitude to emulator (`emu geo fix`).
   - Restart Device (preserves user data, apps, and accounts).
   - Factory Reset (wipes user data partition with confirmation warning).
   - Graceful shutdown.

7. **Zero Artificial Time Limits**:
   - No 30-minute or 60-minute session expiration.
   - No forced disconnects or countdown timers.
   - Devices run continuously until stopped by the user.

8. **First-Run Setup Wizard (10 Steps)**:
   - Step 1: Detect Operating System & Architecture.
   - Step 2: Detect Android SDK installation.
   - Step 3: Detect Android Emulator binary.
   - Step 4: Detect ADB binary and version.
   - Step 5: Detect installed system images & Google Play capability.
   - Step 6: Detect available AVDs.
   - Step 7: Hardware acceleration check (Hypervisor.framework, Intel VMX, KVM, WHPX).
   - Step 8: Google Play readiness validation.
   - Step 9: Emulator runtime health check.
   - Step 10: Platform status confirmed.

9. **Network & System Diagnostics**:
   - Live tests for DNS, HTTP, HTTPS, Play Store endpoints, Chrome web access, and ADB latency.
   - Automated 20+ test suite verifying discovery, lifecycle, persistence, and screen streaming.

10. **Admin Panel**:
    - Real-time host telemetry (CPU %, RAM, Disk, Hypervisor).
    - Concurrency and upload limit configuration.
    - Security audit logs.

---

## 🏗️ Architecture

```
/Users/mac/Virtual/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI REST API & WebSocket server
│   │   ├── config.py                   # Dynamic SDK, paths & port allocation
│   │   ├── system_discovery.py         # OS, CPU arch, Hypervisor, SDK, AVD scan
│   │   ├── adb_manager.py              # Real ADB client (serial targeted, input, screencap, shell)
│   │   ├── avd_manager.py              # AVD creation, deletion, wipe-data, list
│   │   ├── emulator_manager.py         # Multi-instance process management, ports, health checks
│   │   ├── screen_streamer.py          # WebSocket low-latency frame capture & touch/key bridge
│   │   ├── apk_manager.py              # APK upload, inspection, install, launch, uninstall
│   │   ├── file_manager.py             # Push/pull files to Android /sdcard/Download
│   │   ├── diagnostics.py              # 10-step setup wizard & network test suite
│   │   ├── admin.py                    # Host metrics, audit logs, configuration
│   │   ├── security.py                 # Token auth, input sanitization, path traversal defense
│   │   └── models.py                   # Pydantic data schemas
│   ├── requirements.txt                # FastAPI, uvicorn, websockets, psutil, pillow
│   └── run.py                          # Startup script for backend
├── frontend/
│   ├── src/
│   │   ├── components/                 # Canvas, Toolbar, Play Store, Chrome, APK, Terminal, Logs
│   │   ├── pages/                      # Dashboard, Devices, CreateDevice, LiveDevice, Admin, Diagnostics
│   │   ├── services/api.ts             # Typed REST API service
│   │   ├── index.css                   # Glassmorphism dark/light design system
│   │   ├── App.tsx                     # Main router and state coordinator
│   │   └── main.tsx                    # React entrypoint
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   ├── start.sh                        # Bootstrap script for one-command launch
│   └── setup_avd.sh                    # Helper to initialize Google Play AVDs
├── tests/
│   ├── test_system_discovery.py        # System & SDK detection tests
│   ├── test_adb_manager.py             # ADB serial communication tests
│   └── test_backend_api.py             # FastAPI REST endpoint integration tests
└── README.md
```

---

## 🚀 Quick Start

### 1. Launch Platform
```bash
./scripts/start.sh
```
The unified platform starts on `http://localhost:8000`.

### 2. Run Automated Test Suite
```bash
cd backend
./venv/bin/python -m pytest ../tests -v
```

---

## 🔒 Security & Persistence
- **No Command Injection**: Shell inputs are sanitized and scoped strictly to the selected device serial via argument arrays.
- **Path Traversal Protection**: Uploaded files and paths are validated against allowed root directories.
- **Continuous Persistence**: AVD userdata partitions (`userdata-qemu.img`) are preserved across reboots unless the user explicitly invokes **Factory Reset**.
