import React, { useMemo, useState } from 'react';
import { useAuth, storage } from '../contexts/AuthContext';
import { LEVELS, decodeShareCode } from '../utils/questions';

export default function StudentDashboard() {
  const { user, navigate, pageProps } = useAuth();
  const scores = useMemo(() => storage.getScores(user.id), [user.id]);
  const myRequests = useMemo(
    () => storage.getExamRequests().filter((r) => r.studentId === user.id),
    [user.id]
  );
  const daily = storage.getDailyProgress(user.id);
  const todayDone = daily?.date === new Date().toDateString() && daily?.completed;

  const [viewResult, setViewResult] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importCode, setImportCode] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  const totalSessions = scores.length;
  const avgPct = scores.length
    ? Math.round(scores.reduce((s, r) => s + (r.correct / r.total) * 100, 0) / scores.length)
    : 0;
  const streak = calcStreak(scores);
  const level = user.level || 'basic';
  const levelName = LEVELS[level]?.name || level;

  // Get available exams (from teacher or imported)
  const exams = useMemo(() => {
    const allExams = storage.getExams();
    // Show all exams to students (for demo — no teacher filtering)
    return allExams;
  }, [user.teacherId, user.id]);

  // Exam results
  const examResults = useMemo(() => storage.getExamResults(user.id), [user.id]);

  const handleImport = () => {
    setImportError('');
    setImportSuccess('');

    if (!importCode.trim()) {
      setImportError('Please paste the share code');
      return;
    }

    // Try JSON file import
    let examData = null;
    try {
      examData = JSON.parse(importCode.trim());
    } catch {
      // Try base64 decode
      examData = decodeShareCode(importCode.trim());
    }

    if (!examData || !examData.sections) {
      setImportError('Invalid share code. Please check and try again.');
      return;
    }

    examData.importedBy = user.id;
    storage.importExam(examData);
    setImportSuccess('Exam imported successfully!');
    setImportCode('');
    setTimeout(() => { setImportSuccess(''); setShowImport(false); }, 2000);
  };

  const handleFileImport = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.sections) throw new Error('Invalid');
        data.importedBy = user.id;
        storage.importExam(data);
        setImportSuccess('Exam imported from file!');
        setTimeout(() => { setImportSuccess(''); setShowImport(false); }, 2000);
      } catch {
        setImportError('Invalid exam file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="page-content">
      {/* Flash message (e.g. after sending a cancel request) */}
      {pageProps?.flash && (
        <div
          style={{
            background: 'rgba(254,101,31,0.12)',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span className="material-icons-round" style={{ fontSize: 18 }}>info</span>
          {pageProps.flash}
        </div>
      )}

      {/* Hero */}
      <div className="dashboard-hero">
        <div className="hero-greeting">
          {greeting()}, {user.name.split(' ')[0]}! <span className="material-icons-round" style={{ fontSize: 20, verticalAlign: 'middle' }}>waving_hand</span>
        </div>
        <div className="hero-subtitle">
          {levelName} • {user.xp || 0} XP
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
            <span>Progress</span>
            <span>{(user.xp || 0) % 500} / 500 XP</span>
          </div>
          <div className="progress-bar-wrap" style={{ height: 10 }}>
            <div className="progress-bar-fill" style={{ width: `${((user.xp || 0) % 500) / 5}%` }} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value text-accent">{totalSessions}</div>
          <div className="stat-label">Sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-success">{avgPct}%</div>
          <div className="stat-label">Accuracy</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--teal)' }}>{streak}</div>
          <div className="stat-label">Day Streak</div>
        </div>
      </div>

      {/* Action cards */}
      <div className="actions-grid">
        <div className="action-card practice" onClick={() => navigate('practice')}>
          <span className="action-icon"><span className="material-icons-round">straighten</span></span>
          <div className="action-title">Practice Mode</div>
          <div className="action-desc">Solve chain questions with your Abacus.</div>
        </div>

        <div className="action-card challenge" onClick={() => navigate('challenge')}>
          <span className="action-icon"><span className="material-icons-round">emoji_events</span></span>
          <div className="action-title">Daily Challenge</div>
          <div className="action-desc">10 timed questions every day. Earn bonus XP!</div>
          {todayDone
            ? <span className="action-badge">Completed today</span>
            : <span className="action-badge" style={{ background: 'rgba(254,101,31,0.15)', color: 'var(--accent)' }}>Available!</span>
          }
        </div>

        <div className="action-card freeplay" onClick={() => navigate('freeplay')}>
          <span className="action-icon"><span className="material-icons-round">calculate</span></span>
          <div className="action-title">Free Play</div>
          <div className="action-desc">Use the Abacus freely. No pressure.</div>
        </div>
      </div>

      {/* ── EXAM CANCELLATION REQUESTS ── */}
      {myRequests.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>
            <span className="material-icons-round" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>rule</span>
            Exam Cancellation Requests
          </div>
          {myRequests.map((r) => {
            const pill =
              r.status === 'approved'
                ? { bg: 'rgba(46,204,113,0.15)', col: 'var(--success)', label: 'Approved' }
                : r.status === 'rejected'
                ? { bg: 'rgba(231,76,60,0.15)', col: 'var(--danger)', label: 'Rejected' }
                : { bg: 'rgba(243,156,18,0.15)', col: 'var(--warn)', label: 'Pending' };
            return (
              <div key={r.id} className="card" style={{ marginBottom: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{r.examTitle}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>
                      Reason: {r.reason}
                    </div>
                    {r.teacherNote && (
                      <div style={{ fontSize: '0.78rem', color: pill.col, marginTop: 3, fontWeight: 600 }}>
                        Teacher: {r.teacherNote}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      background: pill.bg,
                      color: pill.col,
                      borderRadius: 20,
                      padding: '3px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pill.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── EXAMS SECTION ── */}
      <div className="section-heading" style={{ marginTop: 8 }}>
        <div className="section-title">
          <span className="material-icons-round" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>assignment</span>
          Exam Papers
        </div>
      </div>

      {/* Import Exam — hidden for now */}

      {/* Exam list */}
      {exams.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8, color: 'var(--text-muted)' }}>
            <span className="material-icons-round" style={{ fontSize: 'inherit' }}>assignment</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No exams available yet. Your teacher will assign exams soon.
          </p>
        </div>
      ) : (
        <div>
          {exams.map(exam => {
            const totalQ = exam.sections?.reduce((s, sec) => s + sec.questions.length, 0) || 0;
            const taken = examResults.find(r => r.examId === exam.id);
            return (
              <div key={exam.id} className="card" style={{ marginBottom: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{exam.title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {exam.levelName || exam.level} • {totalQ} Qs • {exam.fullMarks} marks • {(exam.totalTime || 1200) / 60} min
                    </div>
                    {taken && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: 4, fontWeight: 600 }}>
                        Score: {taken.totalMarks}/{taken.maxMarks} ({Math.round(taken.totalMarks / taken.maxMarks * 100)}%)
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {taken && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setViewResult(viewResult === exam.id ? null : exam.id)}
                        style={{ fontSize: '0.75rem' }}
                      >
                        <span className="material-icons-round" style={{ fontSize: 14 }}>visibility</span> Result
                      </button>
                    )}
                    <button
                      className={`btn ${taken ? 'btn-ghost' : 'btn-primary'} btn-sm`}
                      onClick={() => navigate('exam', { exam })}
                    >
                      {taken ? 'Retake' : 'Start'}
                      <span className="material-icons-round" style={{ fontSize: 14, marginLeft: 4 }}>arrow_forward</span>
                    </button>
                  </div>
                </div>
                {/* Expandable result history */}
                {viewResult === exam.id && (() => {
                  const results = examResults.filter(r => r.examId === exam.id);
                  return (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 8, color: 'var(--text-muted)' }}>
                        <span className="material-icons-round" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>history</span>
                        Attempt History ({results.length})
                      </div>
                      {results.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No attempts yet.</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>#</th>
                              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Date</th>
                              <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Score</th>
                              <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>%</th>
                              <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.map((r, ri) => {
                              const pct = r.maxMarks > 0 ? Math.round((r.totalMarks / r.maxMarks) * 100) : 0;
                              const mins = Math.floor((r.timeUsed || 0) / 60);
                              const secs = (r.timeUsed || 0) % 60;
                              return (
                                <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '6px 8px' }}>{ri + 1}</td>
                                  <td style={{ padding: '6px 8px' }}>{r.date ? new Date(r.date).toLocaleDateString() : '—'}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>
                                    {r.totalMarks}/{r.maxMarks}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: pct >= 60 ? 'var(--success)' : pct >= 30 ? 'var(--gold)' : 'var(--danger)' }}>
                                    {pct}%
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {mins}:{secs.toString().padStart(2, '0')}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Score history */}
      <div className="section-heading" style={{ marginTop: 24 }}>
        <div className="section-title"><span className="material-icons-round" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>trending_up</span> Recent Sessions</div>
      </div>

      {scores.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><span className="material-icons-round" style={{ fontSize: 'inherit' }}>assignment</span></div>
          <p>No sessions yet. Start practicing!</p>
        </div>
      ) : (
        <div className="score-list">
          {scores.slice(0, 8).map((s, i) => {
            const pct = Math.round((s.correct / s.total) * 100);
            return (
              <div key={i} className="score-item">
                <div>
                  <div className="score-mode">{s.mode}</div>
                  <div className="score-date">{new Date(s.date).toLocaleDateString()}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {s.correct}/{s.total} correct
                  </div>
                  <div className="progress-bar-wrap" style={{ width: 100, marginTop: 4 }}>
                    <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className={`score-pct ${pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low'}`}>
                  {pct}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function calcStreak(scores) {
  if (!scores.length) return 0;
  const days = [...new Set(scores.map((s) => new Date(s.date).toDateString()))];
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const a = new Date(days[i - 1]);
    const b = new Date(days[i]);
    const diff = Math.round((a - b) / (1000 * 60 * 60 * 24));
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}
