import React, { useState, useCallback, useEffect, useRef } from 'react';
import SorobanColumn from './SorobanColumn';

// 17 rods – standard Indian abacus layout (right to left: units → higher places)
const COLUMNS = [
  { placeValue: 10000000000000000, label: '' },
  { placeValue: 1000000000000000,  label: '' },
  { placeValue: 100000000000000,   label: '' },
  { placeValue: 10000000000000,    label: '' },
  { placeValue: 1000000000000,     label: '' },
  { placeValue: 100000000000,      label: '' },
  { placeValue: 10000000000,       label: '' },
  { placeValue: 1000000000,        label: '' },
  { placeValue: 100000000,         label: '10Cr' },
  { placeValue: 10000000,          label: '1Cr' },
  { placeValue: 1000000,           label: '10L' },
  { placeValue: 100000,            label: '1L' },
  { placeValue: 10000,             label: '10K' },
  { placeValue: 1000,              label: '1K' },
  { placeValue: 100,               label: '100' },
  { placeValue: 10,                label: '10' },
  { placeValue: 1,                 label: '1' },
];

const INIT = {};
COLUMNS.forEach((c) => { INIT[c.placeValue] = 0; });

// ─── SOROBAN ─────────────────────────────────────────────────
export default function Soroban({ onValueChange, resetKey = 0, disabled = false, targetValue = null }) {
  const [colValues, setColValues] = useState({ ...INIT });
  const [resetId, setResetId] = useState(0);
  const frameRef = useRef(null);
  const wrapRef = useRef(null);
  const [layout, setLayout] = useState({ scale: 1, height: 'auto' });

  const total = Object.values(colValues).reduce((s, v) => s + v, 0);

  useEffect(() => {
    onValueChange?.(total);
  }, [total]);

  useEffect(() => {
    setColValues({ ...INIT });
    setResetId((r) => r + 1);
  }, [resetKey]);

  // Measure frame after paint and compute scale + container height
  useEffect(() => {
    const measure = () => {
      const frame = frameRef.current;
      const wrap = wrapRef.current;
      if (!frame || !wrap) return;
      const frameW = frame.scrollWidth;
      const frameH = frame.scrollHeight;
      const wrapW = wrap.clientWidth;
      if (frameW > wrapW) {
        const s = Math.max(0.45, wrapW / frameW);
        setLayout({ scale: s, height: Math.ceil(frameH * s) });
      } else {
        setLayout({ scale: 1, height: 'auto' });
      }
    };
    // Use rAF to measure after browser paints the full frame
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
  }, [resetId]);

  const handleColChange = useCallback((placeValue, value) => {
    setColValues((prev) => ({ ...prev, [placeValue]: value }));
  }, []);

  const handleReset = () => {
    setColValues({ ...INIT });
    setResetId((r) => r + 1);
  };

  const needsScale = layout.scale < 1;

  return (
    <div className="soroban-wrapper">
      {/* Numeric display */}
      <div className="soroban-value-display">
        {total === 0 ? '0' : total.toLocaleString()}
        {targetValue !== null && (
          <span
            style={{
              fontSize: '0.9rem',
              marginLeft: 16,
              color: total === targetValue ? 'var(--success)' : 'var(--text-dim)',
              fontWeight: 600,
              fontFamily: 'system-ui',
            }}
          >
            {total === targetValue ? '✓ Correct!' : `Target: ${targetValue}`}
          </span>
        )}
      </div>

      {/* Soroban frame – auto-scaled to fit width on small screens */}
      <div
        className="soroban-scroll"
        ref={wrapRef}
        style={needsScale ? {
          overflow: 'visible',
          height: layout.height,
          position: 'relative',
        } : undefined}
      >
        <div
          className="soroban-frame"
          ref={frameRef}
          style={needsScale ? {
            transform: `scale(${layout.scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
          } : undefined}
        >
          <div className="soroban-top-bar" />
          <div className="soroban-columns">
            {COLUMNS.map((col) => (
              <SorobanColumn
                key={`${col.placeValue}-${resetId}`}
                placeValue={col.placeValue}
                label={col.label}
                onValueChange={handleColChange}
                disabled={disabled}
              />
            ))}
          </div>
          <div className="soroban-bottom-bar" />
        </div>
      </div>

      {/* Controls */}
      <div className="soroban-controls">
        <button className="btn btn-ghost btn-sm" onClick={handleReset}>
          <span className="material-icons-round" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>refresh</span> Reset
        </button>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Tap or drag beads
        </span>
      </div>
    </div>
  );
}
