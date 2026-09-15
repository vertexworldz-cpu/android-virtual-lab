import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Wand2, ArrowRight, RefreshCw, X, Copy, Terminal } from 'lucide-react';
import { SetupWizardReport } from '../../types';
import { api } from '../../services/api';

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({ isOpen, onClose, onToast }) => {
  const [report, setReport] = useState<SetupWizardReport | null>(null);
  const [loading, setLoading] = useState(false);

  const runWizard = async () => {
    try {
      setLoading(true);
      const res = await api.getWizard();
      setReport(res);
    } catch (e: any) {
      onToast(e.message || 'Failed to run setup wizard', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runWizard();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    onToast('Command copied to clipboard!', 'info');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1.5rem',
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '740px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-glow)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(61, 220, 132, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Wand2 size={22} color="#3DDC84" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                First-Run Setup Wizard
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                10-Step Environment & Official Android Tooling Detection
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button onClick={runWizard} className="btn btn-secondary btn-sm" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Rescan
            </button>
            <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '0.4rem' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Steps List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {!report ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              Scanning host operating system, Android SDK, and virtualization...
            </div>
          ) : (
            report.steps.map((step) => {
              const isPassed = step.status === 'passed';
              const isWarn = step.status === 'warning';
              const isFail = step.status === 'failed';

              return (
                <div
                  key={step.step_number}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '0.85rem 1rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {isPassed && <CheckCircle2 size={18} color="#3DDC84" />}
                      {isWarn && <AlertTriangle size={18} color="#ffb300" />}
                      {isFail && <XCircle size={18} color="#ff4b4b" />}

                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#fff' }}>
                        Step {step.step_number}: {step.title}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: isPassed ? '#3DDC84' : isWarn ? '#ffb300' : '#ff4b4b',
                      }}
                    >
                      {step.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.4rem', marginLeft: '1.85rem' }}>
                    {step.detail}
                  </div>

                  {step.recommended_action && (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        marginLeft: '1.85rem',
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'rgba(255, 179, 0, 0.1)',
                        borderLeft: '3px solid #ffb300',
                        borderRadius: '4px',
                        fontSize: '0.775rem',
                        color: '#ffe082',
                      }}
                    >
                      <strong>Remediation:</strong> {step.recommended_action}
                    </div>
                  )}

                  {step.command_hint && (
                    <div
                      style={{
                        marginTop: '0.4rem',
                        marginLeft: '1.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.65rem',
                        backgroundColor: '#050810',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: '#38bdf8',
                      }}
                    >
                      <span>{step.command_hint}</span>
                      <button
                        onClick={() => copyCommand(step.command_hint!)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.4rem', height: 'auto' }}
                        title="Copy command"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Official Android SDK and Emulator Integration
          </span>

          <button onClick={onClose} className="btn btn-primary">
            Enter Android Virtual Lab <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
