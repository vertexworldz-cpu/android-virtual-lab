import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw, Globe, Wifi, Server, Shield } from 'lucide-react';
import { NetworkDiagnostics as NetworkDiagType } from '../types';
import { api } from '../services/api';

export const NetworkDiagnostics: React.FC = () => {
  const [data, setData] = useState<NetworkDiagType | null>(null);
  const [loading, setLoading] = useState(false);

  const runTests = async () => {
    try {
      setLoading(true);
      const res = await api.getNetworkDiagnostics();
      setData(res);
    } catch (e) {
      console.warn('Network diagnostics failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runTests();
  }, []);

  const items = data
    ? [
        { name: 'DNS Resolution', key: 'dns', val: data.dns, icon: Globe },
        { name: 'HTTP Connectivity', key: 'http', val: data.http, icon: Wifi },
        { name: 'HTTPS Secure Socket', key: 'https', val: data.https, icon: Shield },
        { name: 'Google Play Store Endpoints', key: 'google_play', val: data.google_play, icon: Server },
        { name: 'Chrome Web Access', key: 'chrome', val: data.chrome, icon: Globe },
        { name: 'ADB Host Server Communication', key: 'adb', val: data.adb, icon: Activity },
      ]
    : [];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            Network Diagnostics
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Real-time validation of internet, DNS, Play Store, and ADB network connectivity
          </span>
        </div>

        <button onClick={runTests} className="btn btn-primary" disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} /> Run Diagnostics
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!data ? (
          <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Running network probes across DNS, Google Play, Chrome, and ADB...
          </div>
        ) : (
          items.map((it) => {
            const Icon = it.icon;
            const passed = it.val.passed;
            return (
              <div
                key={it.key}
                className="glass-card"
                style={{
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderLeft: passed ? '4px solid #3DDC84' : '4px solid #ff4b4b',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      backgroundColor: passed ? 'rgba(61, 220, 132, 0.1)' : 'rgba(255, 75, 75, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={22} color={passed ? '#3DDC84' : '#ff4b4b'} />
                  </div>

                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', marginBottom: '0.2rem' }}>
                      {it.name}
                    </h4>
                    <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                      {it.val.details}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: passed ? '#3DDC84' : '#ff4b4b',
                    }}
                  >
                    {passed ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    {passed ? 'Passed' : 'Failed'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                    {it.val.latency_ms} ms
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
