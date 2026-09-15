"""
Unit and integration tests for ADB Manager.
"""
import pytest
import asyncio
from app.adb_manager import adb_manager


@pytest.mark.asyncio
async def test_adb_binary_detection():
    adb_bin = adb_manager.get_adb_binary()
    assert adb_bin is not None
    assert "adb" in adb_bin


@pytest.mark.asyncio
async def test_adb_version_call():
    code, out, err = await adb_manager.run_adb(["version"])
    assert code == 0
    assert "Android Debug Bridge" in out


@pytest.mark.asyncio
async def test_adb_get_devices():
    devices = await adb_manager.get_connected_devices()
    assert isinstance(devices, list)
