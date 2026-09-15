"""
Configuration and environment paths for Android Virtual Lab.
Supports macOS, Linux, and Windows without hardcoding paths.
"""
import os
import sys
import platform
from pathlib import Path
from typing import Optional, List


class Settings:
    PROJECT_NAME: str = "Android Virtual Lab"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Base workspace directory
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    UPLOADS_DIR: Path = BASE_DIR / "uploads"
    RECORDINGS_DIR: Path = BASE_DIR / "recordings"
    SCREENSHOTS_DIR: Path = BASE_DIR / "screenshots"

    # Security & limits
    MAX_UPLOAD_SIZE_MB: int = 500
    MAX_CONCURRENT_EMULATORS: int = 4
    JWT_SECRET: str = os.getenv("AVL_JWT_SECRET", "android-virtual-lab-super-secret-key-2026")
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000", "*"]

    # Port allocation for emulators (ports must be even numbers: 5554, 5556, 5558...)
    EMULATOR_START_PORT: int = 5554
    EMULATOR_PORT_STEP: int = 2

    FRONTEND_DIST_DIR: Path = BASE_DIR.parent / "frontend" / "dist"

    def __init__(self):
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        self.RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
        self.SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        
        # Ensure JAVA_HOME is configured for Android tooling
        if not os.getenv("JAVA_HOME"):
            candidates = [
                Path("/usr/local/opt/openjdk@17"),
                Path("/usr/local/opt/openjdk"),
                Path("/opt/homebrew/opt/openjdk@17"),
                Path("/opt/homebrew/opt/openjdk"),
            ]
            for c in candidates:
                if c.exists():
                    os.environ["JAVA_HOME"] = str(c)
                    os.environ["PATH"] = f"{c}/bin:{os.environ.get('PATH', '')}"
                    break

    @property
    def os_type(self) -> str:
        s = platform.system().lower()
        if "darwin" in s:
            return "macos"
        elif "linux" in s:
            return "linux"
        elif "windows" in s:
            return "windows"
        return s

    @property
    def arch(self) -> str:
        m = platform.machine().lower()
        if m in ["x86_64", "amd64"]:
            return "x86_64"
        elif m in ["arm64", "aarch64"]:
            return "arm64"
        return m

    def get_sdk_search_paths(self) -> List[Path]:
        """Returns ordered list of candidate SDK directories based on OS and environment."""
        paths: List[Path] = []
        
        # 1. User/environment override
        env_sdk = os.getenv("ANDROID_HOME") or os.getenv("ANDROID_SDK_ROOT") or os.getenv("AVL_ANDROID_SDK_PATH")
        if env_sdk:
            paths.append(Path(env_sdk).expanduser().resolve())

        home = Path.home()
        if self.os_type == "macos":
            paths.extend([
                home / "Library" / "Android" / "sdk",
                Path("/usr/local/share/android-commandlinetools"),
                Path("/opt/homebrew/share/android-commandlinetools"),
                Path("/usr/local/Caskroom/android-platform-tools"),
                home / "Android" / "sdk",
            ])
        elif self.os_type == "linux":
            paths.extend([
                home / "Android" / "Sdk",
                Path("/usr/lib/android-sdk"),
                Path("/opt/android-sdk"),
                Path("/var/lib/android-sdk"),
            ])
        elif self.os_type == "windows":
            local_app_data = os.getenv("LOCALAPPDATA")
            if local_app_data:
                paths.append(Path(local_app_data) / "Android" / "Sdk")
            paths.extend([
                home / "AppData" / "Local" / "Android" / "Sdk",
                Path("C:/Android/Sdk"),
            ])

        return paths

    def get_android_sdk_path(self) -> Optional[Path]:
        """Finds the active Android SDK directory."""
        for p in self.get_sdk_search_paths():
            if p.exists() and p.is_dir():
                # Verify if it has at least platform-tools, emulator, or cmdline-tools
                if (p / "platform-tools").exists() or (p / "emulator").exists() or (p / "cmdline-tools").exists():
                    return p
        return None

    def get_adb_path(self) -> Optional[Path]:
        """Finds adb executable."""
        # 1. Check PATH
        import shutil
        adb_in_path = shutil.which("adb")
        if adb_in_path:
            return Path(adb_in_path)

        # 2. Check within SDKs
        sdk = self.get_android_sdk_path()
        if sdk:
            candidate = sdk / "platform-tools" / ("adb.exe" if self.os_type == "windows" else "adb")
            if candidate.exists():
                return candidate

        # 3. Check common brew locations
        for p in [Path("/usr/local/bin/adb"), Path("/opt/homebrew/bin/adb")]:
            if p.exists():
                return p

        return None

    def get_emulator_path(self) -> Optional[Path]:
        """Finds official Android emulator executable."""
        import shutil
        emu_in_path = shutil.which("emulator")
        if emu_in_path:
            return Path(emu_in_path)

        sdk = self.get_android_sdk_path()
        if sdk:
            candidate = sdk / "emulator" / ("emulator.exe" if self.os_type == "windows" else "emulator")
            if candidate.exists():
                return candidate

        home = Path.home()
        candidates = [
            home / "Library" / "Android" / "sdk" / "emulator" / "emulator",
            home / "Android" / "Sdk" / "emulator" / "emulator",
            Path("/usr/local/share/android-commandlinetools/emulator/emulator"),
        ]
        for c in candidates:
            if c.exists():
                return c

        return None

    def get_avd_manager_path(self) -> Optional[Path]:
        """Finds avdmanager tool."""
        import shutil
        avd_in_path = shutil.which("avdmanager")
        if avd_in_path:
            return Path(avd_in_path)

        sdk = self.get_android_sdk_path()
        if sdk:
            for sub in ["cmdline-tools/latest/bin", "cmdline-tools/bin", "tools/bin"]:
                p = sdk / sub / ("avdmanager.bat" if self.os_type == "windows" else "avdmanager")
                if p.exists():
                    return p

        candidates = [
            Path("/usr/local/share/android-commandlinetools/cmdline-tools/latest/bin/avdmanager"),
            Path("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin/avdmanager"),
        ]
        for c in candidates:
            if c.exists():
                return c

        return None

    def get_sdk_manager_path(self) -> Optional[Path]:
        """Finds sdkmanager tool."""
        import shutil
        sdk_in_path = shutil.which("sdkmanager")
        if sdk_in_path:
            return Path(sdk_in_path)

        sdk = self.get_android_sdk_path()
        if sdk:
            for sub in ["cmdline-tools/latest/bin", "cmdline-tools/bin", "tools/bin"]:
                p = sdk / sub / ("sdkmanager.bat" if self.os_type == "windows" else "sdkmanager")
                if p.exists():
                    return p

        candidates = [
            Path("/usr/local/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager"),
            Path("/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager"),
        ]
        for c in candidates:
            if c.exists():
                return c

        return None

    def get_avd_home(self) -> Path:
        """Returns directory where AVD .ini and .avd folders are stored."""
        env_avd = os.getenv("ANDROID_AVD_HOME")
        if env_avd:
            p = Path(env_avd).expanduser().resolve()
            p.mkdir(parents=True, exist_ok=True)
            return p
        
        home = Path.home()
        p = home / ".android" / "avd"
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
