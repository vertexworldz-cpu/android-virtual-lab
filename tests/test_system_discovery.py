"""
Unit tests for System and SDK Discovery.
"""
import pytest
from app.system_discovery import discovery, STANDARD_PROFILES
from app.config import settings


def test_host_metrics():
    metrics = discovery.get_host_metrics()
    assert metrics.os_name != ""
    assert metrics.cpu_count > 0
    assert metrics.ram_total_gb > 0
    assert metrics.disk_total_gb > 0


def test_hardware_acceleration_detection():
    hv_avail, hv_type = discovery.check_hypervisor()
    assert isinstance(hv_avail, bool)
    assert isinstance(hv_type, str)
    # On macOS Intel with VMX, hv_avail should be True
    assert hv_avail is True


def test_standard_profiles_exist():
    assert len(STANDARD_PROFILES) >= 10
    profile_names = [p.name for p in STANDARD_PROFILES]
    assert "Pixel 8" in profile_names
    assert "Pixel Tablet" in profile_names
    assert "Generic Phone" in profile_names


def test_setup_wizard():
    report = discovery.run_setup_wizard()
    assert report.completed is True
    assert len(report.steps) == 10
    step_titles = [s.title for s in report.steps]
    assert "Operating System" in step_titles
    assert "Android Debug Bridge (ADB)" in step_titles
    assert "Hardware Acceleration" in step_titles
