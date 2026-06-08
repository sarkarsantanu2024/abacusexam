import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Soroban from '../components/Soroban';

export default function FreePlay() {
  const { navigate } = useAuth();
  const [value, setValue] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [history, setHistory] = useState([]);

  const saveValue = () => {
    if (value > 0) {
      setHistory((h) => [value, ...h].slice(0, 20));
    }
  };

  return (
    <div className="page-content">
      <div className="practice-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('student-dashboard')}>← Back</button>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}><span className="material-icons-round" style={{ fontSize: 20, verticalAlign: 'middle', marginRight: 4 }}>calculate</span> Free Play</h2>
      </div>

      <div className="card" style={{ textAlign: 'center', marginBottom: 20 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 4 }}>
          Practice on the Abacus freely. No timer, no pressure.
        </p>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
          Tap or drag any bead — upper bead = 5, each lower bead = 1
        </p>
      </div>

      <Soroban
        onValueChange={setValue}
        resetKey={resetKey}
      />

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-gold" onClick={saveValue} disabled={value === 0}>
          <span className="material-icons-round" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>push_pin</span> Save Value ({value})
        </button>
        <button className="btn btn-ghost" onClick={() => setResetKey((k) => k + 1)}>
          ↺ Clear
        </button>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="section-heading">
            <div className="section-title"><span className="material-icons-round" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>bookmark</span> Saved Values</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setHistory([])}>Clear</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {history.map((v, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  color: 'var(--accent-hover)',
                  cursor: 'pointer',
                }}
              >
                {v.toLocaleString()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Soroban guide */}
      <div className="card" style={{ marginTop: 28 }}>
        <div className="card-title" style={{ marginBottom: 12 }}><span className="material-icons-round" style={{ fontSize: 20, verticalAlign: 'middle', marginRight: 4 }}>help_outline</span> How to Use the Abacus</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <p>• <strong style={{ color: 'var(--bead-heaven, #E85D3A)' }}>Upper bead</strong> = 5 points per column. Drag/tap down to activate.</p>
          <p>• <strong style={{ color: 'var(--bead-earth, #E85D3A)' }}>Lower beads</strong> = 1 point each. Tap/drag upward toward the beam to activate.</p>
          <p>• Each column represents a place value: 1, 10, 100, 1000, 10000</p>
          <p>• A column value = (upper × 5) + lower count. Max per column = 9.</p>
        </div>
      </div>
    </div>
  );
}
