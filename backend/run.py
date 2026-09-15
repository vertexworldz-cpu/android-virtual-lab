"""
Entrypoint script for launching Android Virtual Lab backend server.
"""
import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"==================================================")
    print(f"🚀 Starting Android Virtual Lab Backend on {host}:{port}")
    print(f"==================================================")
    uvicorn.run("app.main:app", host=host, port=port, reload=False, log_level="info")
