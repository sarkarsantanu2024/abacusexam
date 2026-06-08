import React, { useState, useRef, useCallback } from 'react';

// ─── CONSTANTS (compact for 17-rod layout) ────────────────────
const BEAD_H = 22;
const GAP = 4;
const HEAVEN_H = 52;
const EARTH_H = 130;
const COL_W = 36;
const TOP_PAD = 3;
const BOTTOM_PAD = 3;
const BEAD_W = 30;

// ─── POSITION HELPERS ─────────────────────────────────────────
const heavenY = (active) =>
  active ? HEAVEN_H - BOTTOM_PAD - BEAD_H : TOP_PAD;

const earthY = (i, earthCount) => {
  if (i < earthCount) {
    // Active: stack near beam (top of earth section)
    return TOP_PAD + i * (BEAD_H + GAP);
  } else {
    // Inactive: stack at bottom
    return EARTH_H - (4 - i) * (BEAD_H + GAP) + GAP - BOTTOM_PAD;
  }
};

// ─── SOROBAN COLUMN ───────────────────────────────────────────
export default function SorobanColumn({ placeValue, label, onValueChange, disabled }) {
  const [heavenActive, setHeavenActive] = useState(false);
  const [earthCount, setEarthCount] = useState(0);

  const drag = useRef(null);

  const notify = useCallback((hActive, eCount) => {
    const val = (hActive ? 5 : 0) + eCount;
    onValueChange?.(placeValue, val * placeValue);
  }, [placeValue, onValueChange]);

  // ── HEAVEN BEAD ─────────────────────────────────────────────
  const handleHeavenPointerDown = (e) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { type: 'heaven', startY: e.clientY, startActive: heavenActive };
  };

  const handleHeavenPointerMove = () => {};

  const handleHeavenPointerUp = (e) => {
    if (!drag.current || drag.current.type !== 'heaven') return;
    const dy = e.clientY - drag.current.startY;
    const threshold = 14;
    let newActive = drag.current.startActive;
    if (!newActive && dy > threshold) newActive = true;
    else if (newActive && dy < -threshold) newActive = false;
    else if (Math.abs(dy) < threshold) newActive = !drag.current.startActive;
    if (newActive !== heavenActive) {
      setHeavenActive(newActive);
      notify(newActive, earthCount);
    }
    drag.current = null;
  };

  // ── EARTH BEADS ─────────────────────────────────────────────
  const handleEarthPointerDown = (e, i) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { type: 'earth', index: i, startY: e.clientY, startCount: earthCount };
  };

  const handleEarthPointerUp = (e, i) => {
    if (!drag.current || drag.current.type !== 'earth') return;
    const dy = e.clientY - drag.current.startY;
    const threshold = 12;
    let newCount = earthCount;

    if (Math.abs(dy) < threshold) {
      if (i < earthCount) {
        newCount = i;
      } else {
        newCount = i + 1;
      }
    } else if (dy < -threshold) {
      newCount = Math.min(4, i + 1);
    } else if (dy > threshold) {
      newCount = Math.max(0, i);
    }

    if (newCount !== earthCount) {
      setEarthCount(newCount);
      notify(heavenActive, newCount);
    }
    drag.current = null;
  };

  return (
    <div
      className="soroban-column"
      style={{ width: COL_W, userSelect: 'none' }}
    >
      {/* Column label */}
      <div className="soroban-col-label">{label}</div>

      {/* Heaven section */}
      <div className="heaven-section" style={{ height: HEAVEN_H, width: COL_W }}>
        <div className="rod" />
        <div
          className={`bead heaven-bead${heavenActive ? ' active' : ''}`}
          style={{
            top: heavenY(heavenActive),
            width: BEAD_W,
            height: BEAD_H,
            transition: 'top 0.13s cubic-bezier(0.25,0.46,0.45,0.94)',
            touchAction: 'none',
          }}
          onPointerDown={handleHeavenPointerDown}
          onPointerMove={handleHeavenPointerMove}
          onPointerUp={handleHeavenPointerUp}
        />
      </div>

      {/* Beam */}
      <div className="beam-bar" />

      {/* Earth section */}
      <div className="earth-section" style={{ height: EARTH_H, width: COL_W }}>
        <div className="rod" />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`bead earth-bead${i < earthCount ? ' active' : ''}`}
            style={{
              top: earthY(i, earthCount),
              width: BEAD_W,
              height: BEAD_H,
              transition: 'top 0.13s cubic-bezier(0.25,0.46,0.45,0.94)',
              touchAction: 'none',
            }}
            onPointerDown={(e) => handleEarthPointerDown(e, i)}
            onPointerUp={(e) => handleEarthPointerUp(e, i)}
          />
        ))}
      </div>
    </div>
  );
}
