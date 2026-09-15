import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertCircle, RefreshCw, Wifi, Send, CornerDownLeft, Delete } from 'lucide-react';
import { VirtualDevice } from '../../types';
import { api } from '../../services/api';

interface DeviceCanvasProps {
  device: VirtualDevice;
  onRefresh?: () => void;
}

export const DeviceCanvas: React.FC<DeviceCanvasProps> = ({ device, onRefresh }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const [lastFrameTime, setLastFrameTime] = useState<number>(0);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSendingText, setIsSendingText] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const displayWidth = 380;
  const aspectRatio = device.height > 0 ? device.height / device.width : 2.22;
  const displayHeight = Math.round(displayWidth * aspectRatio);

  // Setup WebSocket frame stream with auto-reconnect and direct port fallback
  useEffect(() => {
    let isSubscribed = true;
    let reconnectTimer: any = null;

    if (device.status !== 'READY') {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      return () => {
        isSubscribed = false;
        if (reconnectTimer) clearTimeout(reconnectTimer);
      };
    }

    const connect = () => {
      if (!isSubscribed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // If running on Vite dev server (5173), connect directly to backend port 8000 for lowest latency
      const port = window.location.port === '5173' ? '8000' : (window.location.port || (protocol === 'wss:' ? '443' : '80'));
      const wsUrl = `${protocol}//${window.location.hostname}:${port}/ws/devices/${device.id}/screen`;

      let frameCount = 0;
      let fpsTimer = Date.now();

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'blob';
      wsRef.current = ws;

      ws.onopen = () => {
        if (isSubscribed) setIsConnected(true);
      };

      ws.onclose = () => {
        if (isSubscribed) {
          setIsConnected(false);
          // Reconnect automatically after 1 second
          reconnectTimer = setTimeout(connect, 1000);
        }
      };

      ws.onerror = (err) => {
        console.warn('WebSocket stream error, reconnecting...', err);
        try {
          ws.close();
        } catch (e) {}
      };

    ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        try {
          const bmp = await createImageBitmap(event.data);
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
            }
          }
          bmp.close();
          frameCount++;
          const now = Date.now();
          if (now - fpsTimer >= 1000) {
            setFps(frameCount);
            frameCount = 0;
            fpsTimer = now;
          }
          setLastFrameTime(now);
        } catch (err) {
          // Fallback if createImageBitmap fails
          const url = URL.createObjectURL(event.data);
          const img = new Image();
          img.onload = () => {
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              }
            }
            URL.revokeObjectURL(url);
          };
          img.src = url;
        }
      }
    };
  };

  connect();

    return () => {
      isSubscribed = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [device.id, device.status]);

  // Touch and Mouse Event Translation
  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerStart = (clientX: number, clientY: number) => {
    const { x, y } = getCanvasCoords(clientX, clientY);
    setDragStart({ x, y, time: Date.now() });
    containerRef.current?.focus();
  };

  const handlePointerEnd = (clientX: number, clientY: number) => {
    if (!dragStart) return;
    const { x: endX, y: endY } = getCanvasCoords(clientX, clientY);
    const duration = Math.max(50, Date.now() - dragStart.time);
    const dist = Math.hypot(endX - dragStart.x, endY - dragStart.y);

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (dist < 0.05 && duration < 600) {
        // Tap gesture (with friendly tolerance for mouse movements)
        ws.send(JSON.stringify({ type: 'tap', x: endX, y: endY }));
      } else {
        // Swipe / Drag gesture
        ws.send(
          JSON.stringify({
            type: 'swipe',
            x1: dragStart.x,
            y1: dragStart.y,
            x2: endX,
            y2: endY,
            duration: Math.min(duration, 800),
          })
        );
      }
    }
    setDragStart(null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handlePointerStart(e.clientX, e.clientY);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handlePointerEnd(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      handlePointerStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.changedTouches.length > 0) {
      handlePointerEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
  };

  // Keyboard typing into active device
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (e.key === 'Backspace') {
      ws.send(JSON.stringify({ type: 'key', keycode: 67 }));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      ws.send(JSON.stringify({ type: 'key', keycode: 66 }));
      e.preventDefault();
    } else if (e.key === 'Tab') {
      ws.send(JSON.stringify({ type: 'key', keycode: 61 }));
      e.preventDefault();
    } else if (e.key === 'Escape') {
      ws.send(JSON.stringify({ type: 'key', keycode: 111 }));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      ws.send(JSON.stringify({ type: 'key', keycode: 19 }));
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      ws.send(JSON.stringify({ type: 'key', keycode: 20 }));
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      ws.send(JSON.stringify({ type: 'key', keycode: 21 }));
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      ws.send(JSON.stringify({ type: 'key', keycode: 22 }));
      e.preventDefault();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      ws.send(JSON.stringify({ type: 'text', text: e.key }));
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        outline: 'none',
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      title="Click on the screen and type on your physical keyboard to control Android"
    >
      {/* Device Header Info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: `${displayWidth}px`,
          padding: '0.25rem 0.5rem',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#3DDC84' : '#64748b',
              boxShadow: isConnected ? '0 0 8px #3DDC84' : 'none',
            }}
          />
          {device.serial || 'No Serial'} ({device.width}x{device.height})
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
          {fps} FPS • {device.has_play_store ? 'Play Store Ready' : 'AOSP'}
        </span>
      </div>

      {/* Phone Frame and Canvas */}
      <div
        className="phone-frame"
        style={{
          width: `${displayWidth + 20}px`,
          height: `${displayHeight + 20}px`,
        }}
      >
        {/* Virtual Speaker / Camera Notch */}
        <div
          style={{
            width: '80px',
            height: '10px',
            backgroundColor: '#1a202c',
            borderRadius: '0 0 10px 10px',
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        />

        {/* Real Live Canvas */}
        <canvas
          ref={canvasRef}
          width={device.width || 1080}
          height={device.height || 2400}
          tabIndex={0}
          className="phone-screen-canvas"
          style={{
            width: `${displayWidth}px`,
            height: `${displayHeight}px`,
            display: device.status === 'READY' ? 'block' : 'none',
            cursor: 'pointer',
            outline: 'none',
          }}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        />

        {/* State Overlays when not READY */}
        {device.status !== 'READY' && (
          <div
            style={{
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
              textAlign: 'center',
              backgroundColor: '#070a12',
              color: 'var(--text-secondary)',
            }}
          >
            {device.status === 'BOOTING' || device.status === 'STARTING' ? (
              <>
                <Loader2 size={42} className="spin" color="#3DDC84" style={{ marginBottom: '1.25rem' }} />
                <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: '0.5rem', fontWeight: 600 }}>
                  Booting Real Android AVD...
                </h3>
                <p style={{ fontSize: '0.775rem', marginBottom: '1.25rem', maxWidth: '280px' }}>
                  {device.boot_status_text || 'Initializing QEMU and connecting ADB...'}
                </p>

                {/* Progress Bar */}
                <div
                  style={{
                    width: '80%',
                    height: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${device.boot_progress || 30}%`,
                      height: '100%',
                      backgroundColor: '#3DDC84',
                      borderRadius: '10px',
                      transition: 'width 0.4s ease',
                      boxShadow: '0 0 10px #3DDC84',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.7rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                  {device.boot_progress}%
                </span>
              </>
            ) : device.status === 'ERROR' ? (
              <>
                <AlertCircle size={44} color="#ff4b4b" style={{ marginBottom: '1rem' }} />
                <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '0.5rem' }}>
                  Device Boot Error
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#ff7b7b', marginBottom: '1rem' }}>
                  {device.error_message || 'An error occurred during emulator launch.'}
                </p>
                {device.error_suggested_fix && (
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Suggested fix: {device.error_suggested_fix}
                  </p>
                )}
                {onRefresh && (
                  <button onClick={onRefresh} className="btn btn-secondary btn-sm">
                    <RefreshCw size={14} /> Retry
                  </button>
                )}
              </>
            ) : (
              <>
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1rem',
                  }}
                >
                  <Wifi size={24} color="#64748b" />
                </div>
                <h3 style={{ color: '#fff', fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                  Virtual Device Stopped
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Start this AVD to stream the real Android screen and interact with apps.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick Text Input Bar for Easy Typing (Email, Passwords, URLs) */}
      {device.status === 'READY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: `${displayWidth + 20}px` }}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!inputText.trim()) return;
              setIsSendingText(true);
              try {
                // Try WebSocket first
                const ws = wsRef.current;
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'text', text: inputText }));
                } else {
                  await api.sendText(device.id, inputText);
                }
                setInputText('');
              } catch (err) {
                console.error('Failed to send text:', err);
              } finally {
                setIsSendingText(false);
              }
            }}
            style={{
              display: 'flex',
              gap: '0.4rem',
              marginTop: '0.2rem',
            }}
          >
            <input
              type="text"
              className="input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type email, password or text here..."
              style={{
                flex: 1,
                padding: '0.55rem 0.85rem',
                fontSize: '0.85rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'rgba(15, 23, 42, 0.7)',
                color: '#fff',
              }}
            />
            <button
              type="submit"
              disabled={isSendingText || !inputText.trim()}
              className="btn btn-primary btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0 0.9rem',
                fontSize: '0.85rem',
              }}
              title="Send text to focused field on Android"
            >
              <Send size={14} /> Send
            </button>
            <button
              type="button"
              onClick={() => {
                const ws = wsRef.current;
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'key', keycode: 66 })); // ENTER
                } else {
                  api.sendButton(device.id, 'enter').catch(() => {});
                }
              }}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0 0.6rem' }}
              title="Enter / Next / Submit"
            >
              <CornerDownLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                const ws = wsRef.current;
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'key', keycode: 67 })); // Backspace
                } else {
                  api.sendButton(device.id, 'backspace').catch(() => {});
                }
              }}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0 0.6rem' }}
              title="Backspace"
            >
              <Delete size={14} />
            </button>
          </form>

          {/* Quick Action Helpers */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 0.2rem',
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
            }}
          >
            <span>💡 Click screen to type directly, or paste above & Send</span>
            <button
              type="button"
              onClick={() => {
                const ws = wsRef.current;
                if (ws && ws.readyState === WebSocket.OPEN) {
                  // Tap email input field location (x: 0.5, y: 0.38)
                  ws.send(JSON.stringify({ type: 'tap', x: 0.5, y: 0.38 }));
                }
              }}
              className="btn btn-secondary btn-xs"
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.7rem',
                borderRadius: '4px',
              }}
              title="Tap to focus the input field in Google Sign-in / forms"
            >
              🎯 Focus Field
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
