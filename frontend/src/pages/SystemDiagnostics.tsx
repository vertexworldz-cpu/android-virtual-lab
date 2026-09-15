import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  RefreshCw,
  Loader2,
  Cpu,
  HardDrive,
  Activity,
  Layers,
  Zap,
} from 'lucide-react';
import { DiagnosticsReport, PerformanceSnapshot } from '../types';
import { api } from '../services/api';

export const SystemDiagnostics: React.FC = () => {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [perf, setPerf] = useState<PerformanceSnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingPerf, setLoadingPerf] = useState(false);

  const fetchPerformance = async () => {
    try {
      setLoadingPerf(true);
      const res = await api.getPerformanceDiagnostics();
      setPerf(res);
    } catch (e) {
      console.warn('Failed to load performance metrics', e);
    } finally {
      setLoadingPerf(false);
    }
  };

  const runSuite = async () => {
    try {
      setRunning(true);
      const res = await api.runDiagnosticsSuite();
      setReport(res);
    } catch (e) {
      console.warn('Diagnostics suite failed', e);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    fetchPerformance();
    runSuite();
    const interval = setInterval(fetchPerformance, 5000);
    return () => clearInterval(interval);
  }, []);


  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            System Diagnostics & Automated Test Suite
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Comprehensive verification of all platform components, ADB, lifecycle, and network layers
          </span>
        </div>

        <button onClick={runSuite} className="btn btn-primary" disabled={running}>
          {running ? <Loader2 size={16} className="spin" /> : <Play size={16} />} Run Complete Test Suite
        </button>
      </div>

      {report && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL TESTS</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', marginTop: '0.25rem' }}>
              {report.total_count}
            </div>
          </div>
          <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#3DDC84' }}>PASSED</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3DDC84', marginTop: '0.25rem' }}>
              {report.passed_count}
            </div>
          </div>
          <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#ff4b4b' }}>FAILED</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ff4b4b', marginTop: '0.25rem' }}>
              {report.failed_count}
            </div>
          </div>
          <div className="glass-card" style={{ padding: '1rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>LAST RUN</span>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginTop: '0.65rem' }}>
              {report.timestamp}
            </div>
          </div>
        </div>
      )}

      {/* 1. Host Hardware & Performance Telemetry (CPU, Cores, RAM, Available RAM, GPU) */}
      {perf && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={18} color="#00E5FF" /> Host Hardware & Performance Telemetry
            </h3>
            <button
              onClick={fetchPerformance}
              disabled={loadingPerf}
              className="btn btn-secondary btn-xs"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <RefreshCw size={12} className={loadingPerf ? 'spin' : ''} /> Refresh Telemetry
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {/* CPU Card */}
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Cpu size={16} /> HOST CPU LOAD
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                  {perf.host.cpu_percent}%
                </span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, perf.host.cpu_percent))}%`,
                    height: '100%',
                    backgroundColor: perf.host.cpu_percent > 80 ? '#ff4b4b' : '#38bdf8',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div><strong>Processor:</strong> {perf.host.cpu_brand}</div>
                <div><strong>CPU Cores:</strong> {perf.host.cpu_count} logical ({perf.host.cpu_physical_cores} physical)</div>
              </div>
            </div>

            {/* RAM Card */}
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#3DDC84', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <HardDrive size={16} /> HOST MEMORY (RAM)
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                  {perf.host.ram_used_gb} / {perf.host.ram_total_gb} GB
                </span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, perf.host.ram_percent))}%`,
                    height: '100%',
                    backgroundColor: perf.host.ram_percent > 85 ? '#ff4b4b' : '#3DDC84',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div><strong>RAM Utilization:</strong> {perf.host.ram_percent}%</div>
                <div><strong>Available RAM:</strong> <span style={{ color: '#3DDC84', fontWeight: 600 }}>{perf.host.ram_available_gb} GB</span></div>
              </div>
            </div>

            {/* GPU Card */}
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e879f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Layers size={16} /> GPU HARDWARE ({perf.host.gpus.length})
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {perf.host.hypervisor_type.split(' ')[0]}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {perf.host.gpus.map((gpu, idx) => (
                  <div key={idx} style={{ padding: '0.4rem 0.6rem', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px', fontSize: '0.75rem' }}>
                    <div style={{ fontWeight: 600, color: '#fff' }}>{gpu.model}</div>
                    <div style={{ color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem', marginTop: '0.15rem' }}>
                      <span>VRAM: <strong style={{ color: '#e879f9' }}>{gpu.vram}</strong></span>
                      <span>Type: {gpu.type}</span>
                      {gpu.metal_support && <span>{gpu.metal_support}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Running Emulator Process Stats (if running) */}
          {perf.emulator_process && (
            <div className="glass-card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderLeft: '4px solid #3DDC84' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ACTIVE EMULATOR PROCESS (QEMU)</span>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                  {perf.active_device_serial || 'Running Emulator'} (PID: {perf.emulator_process.pid})
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <div>CPU: <strong style={{ color: '#fff' }}>{perf.emulator_process.cpu_percent}%</strong></div>
                <div>Memory RSS: <strong style={{ color: '#fff' }}>{perf.emulator_process.memory_rss_mb} MB</strong></div>
                <div>Threads: <strong style={{ color: '#fff' }}>{perf.emulator_process.num_threads}</strong></div>
              </div>
            </div>
          )}

          {/* Bottleneck Analysis & Diagnosis Panel */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={16} color="#fbbf24" /> Root-Cause Bottleneck Discovery
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
              {Object.entries(perf.bottleneck_analysis).map(([key, val]: [string, any]) => (
                <div
                  key={key}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: `3px solid ${val.level === 'optimal' ? '#3DDC84' : val.level === 'critical' ? '#ff4b4b' : '#fbbf24'}`,
                    fontSize: '0.78rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#fff', textTransform: 'capitalize', marginBottom: '0.2rem' }}>
                    {key.replace('_', ' ')}
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>{val.message || val.diagnosis}</div>
                  {val.remedy && (
                    <div style={{ marginTop: '0.35rem', color: '#fbbf24', fontSize: '0.72rem' }}>
                      <strong>Optimization:</strong> {val.remedy}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tests Results */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck size={18} color="#3DDC84" /> Section 26 Verification Checklist
        </h3>


        {!report ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            Executing automated diagnostics suite...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {report.results.map((test) => (
              <div
                key={test.test_id}
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {test.passed ? (
                      <CheckCircle2 size={18} color="#3DDC84" />
                    ) : (
                      <XCircle size={18} color="#ff4b4b" />
                    )}
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#fff' }}>
                      {test.name}
                    </span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {test.category}
                    </span>
                  </div>

                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {test.duration_ms} ms
                  </span>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '1.75rem' }}>
                  {test.details}
                </div>

                {test.suggested_fix && (
                  <div
                    style={{
                      marginLeft: '1.75rem',
                      marginTop: '0.3rem',
                      padding: '0.35rem 0.65rem',
                      backgroundColor: 'rgba(255, 75, 75, 0.1)',
                      borderRadius: '4px',
                      color: '#ff9999',
                      fontSize: '0.75rem',
                    }}
                  >
                    Remediation: {test.suggested_fix}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
