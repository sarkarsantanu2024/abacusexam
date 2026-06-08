import { useState } from 'react';
import { useAuth, storage } from '../contexts/AuthContext';
import Soroban from '../components/Soroban';
import { LEVELS, LEVEL_KEYS, generateChainQuestion, calcXP, getGrade } from '../utils/questions';

const QUESTION_COUNT = 10;

export default function PracticeMode() {
  const { user, navigate, updateUser } = useAuth();
  const [phase, setPhase] = useState('setup');
  const [level, setLevel] = useState(user.level || 'basic');
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [sorobanVal, setSorobanVal] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [results, setResults] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [answering, setAnswering] = useState(false);

  const startPractice = () => {
    const qs = Array.from({ length: QUESTION_COUNT }, () => generateChainQuestion(level));
    setQuestions(qs);
    setQIndex(0);
    setResults([]);
    setFeedback(null);
    setResetKey((k) => k + 1);
    setSorobanVal(0);
    setPhase('play');
  };

  const handleAnswer = () => {
    if (answering) return;
    const q = questions[qIndex];
    const correct = sorobanVal === q.answer;
    const res = { ...q, userAnswer: sorobanVal, correct };

    setFeedback(correct ? 'correct' : 'wrong');
    setAnswering(true);

    setTimeout(() => {
      const newResults = [...results, res];
      if (qIndex + 1 >= QUESTION_COUNT) {
        const correctCount = newResults.filter((r) => r.correct).length;
        const xpGained = calcXP(correctCount, QUESTION_COUNT, level);
        storage.addScore(user.id, {
          mode: `Practice: ${LEVELS[level]?.name || level}`,
          correct: correctCount,
          total: QUESTION_COUNT,
          xpGained,
          level,
        });
        updateUser({ xp: (user.xp || 0) + xpGained });
        setResults(newResults);
        setPhase('results');
      } else {
        setQIndex(qIndex + 1);
        setResetKey((k) => k + 1);
        setSorobanVal(0);
        setFeedback(null);
      }
      setAnswering(false);
    }, 900);
  };

  // ── SETUP ────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="page-content">
        <div className="practice-header">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('student-dashboard')}>← Back</button>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Practice Mode</h2>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>Select Level</div>
          <div className="difficulty-grid">
            {LEVEL_KEYS.map((key) => {
              const cfg = LEVELS[key];
              return (
                <div
                  key={key}
                  className={`diff-btn ${key === level ? 'active' : ''}`}
                  onClick={() => setLevel(key)}
                >
                  <div className="diff-num"><span className="material-icons-round">{cfg.icon}</span></div>
                  <div className="diff-name">{cfg.name}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: 2 }}>{cfg.desc}</div>
                </div>
              );
            })}
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{LEVELS[level]?.name}</div>
            <div style={{ color: 'var(--text-muted)' }}>
              {LEVELS[level]?.desc} • {QUESTION_COUNT} chain questions
            </div>
          </div>

          <button className="btn btn-primary btn-full btn-lg" onClick={startPractice}>
            <span className="material-icons-round" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>play_arrow</span> Start Practice
          </button>
        </div>
      </div>
    );
  }

  // ── PLAY ─────────────────────────────────────────────────────
  if (phase === 'play') {
    const q = questions[qIndex];
    const progress = ((qIndex) / QUESTION_COUNT) * 100;

    return (
      <div className="page-content">
        <div className="practice-header">
          <button className="btn btn-ghost btn-sm" onClick={() => setPhase('setup')}>✕ Quit</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {LEVELS[level]?.name}
          </span>
        </div>

        {/* Progress */}
        <div className="timer-bar-wrap">
          <div className="timer-bar" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
        </div>

        {/* Question — show chain */}
        <div className="question-card">
          <div className="question-counter">Question {qIndex + 1} of {QUESTION_COUNT}</div>
          <div className="chain-display horizontal">
            {q.chain.map((n, i) => (
              <span key={i} className={`chain-num-large ${n < 0 ? 'negative' : 'positive'}`}>
                {i > 0 && n >= 0 ? '+' : ''}{n}
              </span>
            ))}
          </div>
          <div className="question-prompt">Set the answer on your Abacus</div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`answer-feedback ${feedback}`}>
            {feedback === 'correct' ? '✓ Correct! +' + calcXP(1, 1, level) + ' XP' : `✗ Wrong — answer was ${q.answer}`}
          </div>
        )}

        {/* Soroban */}
        <Soroban
          onValueChange={setSorobanVal}
          resetKey={resetKey}
          disabled={answering}
        />

        {/* Submit */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <button
            className="btn btn-gold btn-lg"
            onClick={handleAnswer}
            disabled={answering}
          >
            Submit Answer ({sorobanVal})
          </button>
        </div>
      </div>
    );
  }

  // ── RESULTS ──────────────────────────────────────────────────
  const correctCount = results.filter((r) => r.correct).length;
  const pct = Math.round((correctCount / QUESTION_COUNT) * 100);
  const grade = getGrade(pct);
  const xpGained = calcXP(correctCount, QUESTION_COUNT, level);

  return (
    <div className="page-content">
      <div className="results-card">
        <div className={`results-score ${grade.cls}`}>{pct}%</div>
        <div className="results-label">{grade.label}</div>
        <div className="results-sub">
          {correctCount} / {QUESTION_COUNT} correct • +{xpGained} XP earned
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 24, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <span><span className="material-icons-round" style={{ fontSize: 16, verticalAlign: 'middle' }}>star</span> Grade: <strong className={`text-${grade.cls === 'great' ? 'success' : grade.cls === 'ok' ? 'gold' : 'danger'}`}>{grade.letter}</strong></span>
          <span><span className="material-icons-round" style={{ fontSize: 16, verticalAlign: 'middle' }}>bar_chart</span> {LEVELS[level]?.name}</span>
        </div>

        {/* Detail list */}
        <div className="results-detail-list">
          {results.map((r, i) => (
            <div key={i} className={`result-item ${r.correct ? 'correct' : 'wrong'}`}>
              <span className="result-item-q">
                {r.chain.map((n, ni) => (
                  <span key={ni}>{ni > 0 ? (n >= 0 ? ' + ' : ' − ') : ''}{ni > 0 ? Math.abs(n) : n}</span>
                ))} = {r.answer}
              </span>
              <span className="result-item-info">
                {r.correct ? '✓' : `✗ You: ${r.userAnswer}`}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={startPractice}>Practice Again</button>
          <button className="btn btn-ghost" onClick={() => navigate('student-dashboard')}>← Dashboard</button>
        </div>
      </div>
    </div>
  );
}
