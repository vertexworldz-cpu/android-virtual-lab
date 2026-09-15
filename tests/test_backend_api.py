"""
Integration tests for FastAPI REST endpoints.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_api_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["no_session_limits"] is True


@pytest.mark.asyncio
async def test_api_system_metrics():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/system/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "cpu_count" in data
    assert "ram_total_gb" in data
    assert "hypervisor_available" in data


@pytest.mark.asyncio
async def test_api_system_wizard():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/system/wizard")
    assert response.status_code == 200
    data = response.json()
    assert data["completed"] is True
    assert len(data["steps"]) == 10


@pytest.mark.asyncio
async def test_api_system_profiles():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/system/profiles")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 10


@pytest.mark.asyncio
async def test_api_devices_list():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/devices")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_api_network_diagnostics():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/diagnostics/network")
    assert response.status_code == 200
    data = response.json()
    assert "dns" in data
    assert "http" in data
    assert "https" in data
    assert "google_play" in data
    assert "chrome" in data


@pytest.mark.asyncio
async def test_api_diagnostics_suite():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/diagnostics/run-suite")
    assert response.status_code == 200
    data = response.json()
    assert data["total_count"] >= 10
    assert data["passed_count"] > 0


@pytest.mark.asyncio
async def test_api_performance_diagnostics():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/diagnostics/performance")
    assert response.status_code == 200
    data = response.json()
    assert "host" in data
    assert "cpu_percent" in data["host"]
    assert "cpu_count" in data["host"]
    assert "cpu_physical_cores" in data["host"]
    assert "ram_used_gb" in data["host"]
    assert "ram_available_gb" in data["host"]
    assert "gpus" in data["host"]
    assert len(data["host"]["gpus"]) > 0
    assert "bottleneck_analysis" in data
