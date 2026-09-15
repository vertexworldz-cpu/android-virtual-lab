import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, AlertCircle, Info, AlertTriangle, Terminal } from 'lucide-react';
import { LogEntry } from '../../types';
import { api } from '../../services/api';

interface LiveLogsProps {
  deviceId?: string;
}

export const LiveLogs: React.FC<LiveLogsProps> = ({ deviceId }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await api.getLogs(category === 'all' ? undefined : category, deviceId);
      setLogs(res);
    } catch (e) {
      console.warn('Failed to fetch logs', e);
    }
  };

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 2500);
    return () => clearInterval(interval);
  }, [category, deviceId, autoRefresh]);

  return (
    <div className="glass-card" style={{ padding: '1.25rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={18} color="#3DDC84" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Live Logs & Diagnostics</h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Category Filter */}
          <select
            className="form-select"
            style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.775rem' }}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            <option value="emulator">Emulator</option>
            <option value="adb">ADB</option>
            <option value="network">Network</option>
            <option value="apk">APK Install</option>
            <option value="backend">Backend</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Live Stream
          </label>

          <button onClick={fetchLogs} className="btn btn-secondary btn-sm" title="Refresh Now">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Logs Window */}
      <div
        className="terminal-window"
        style={{
          height: '380px',
          overflowY: 'auto',
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            No logs recorded for this filter.
          </div>
        ) : (
          logs.map((log) => {
            const isError = log.level === 'ERROR';
            const isWarn = log.level === 'WARNING';
            return (
              <div
                key={log.id}
                style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: isError
                    ? 'rgba(255, 75, 75, 0.08)'
                    : isWarn
                    ? 'rgba(255, 179, 0, 0.08)'
                    : 'rgba(255, 255, 255, 0.02)',
                  borderLeft: isError
                    ? '3px solid #ff4b4b'
                    : isWarn
                    ? '3px solid #ffb300'
                    : '3px solid #38bdf8',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{log.timestamp}</span>
                    <span
                      style={{
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: '#fff',
                      }}
                    >
                      {log.category}
                    </span>
                    {log.serial && (
                      <span style={{ color: '#00E5FF', fontSize: '0.7rem' }}>[{log.serial}]</span>
                    )}
                  </div>

                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      color: isError ? '#ff4b4b' : isWarn ? '#ffb300' : '#38bdf8',
                    }}
                  >
                    {log.level}
                  </span>
                </div>

                <div style={{ color: isError ? '#ff9999' : '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                  {log.message}
                </div>

                {log.command && (
                  <div style={{ marginTop: '0.35rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Command: <span style={{ color: '#38bdf8' }}>{log.command}</span>
                  </div>
                )}

                {log.suggested_fix && (
                  <div
                    style={{
                      marginTop: '0.4rem',
                      padding: '0.35rem 0.5rem',
                      backgroundColor: 'rgba(255, 75, 75, 0.15)',
                      borderRadius: '4px',
                      color: '#ffd0d0',
                    }}
                  >
                    💡 <strong>Recommended Action:</strong> {log.suggested_fix}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
