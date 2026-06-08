import { useState, useEffect, useCallback } from 'react';
import { useAuth, storage } from '../contexts/AuthContext';
import Soroban from '../components/Soroban';
import { LEVELS, LEVEL_KEYS, calcXP, getGrade } from '../utils/questions';

const TIME_PER_Q = 30;

// Generate daily chain questions using date as seed
function generateDailyChains(userId = '') {
  const today = new Date().toDateString();
  const seedStr = today + userId;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);

  const levelIdx = seed % 4; // basic, kids1, kids2, kids3
  const levelKey = LEVEL_KEYS[levelIdx];
  const qs = [];

  let s = seed;
  const sr = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return Math.abs(s) / 0xffffffff; };

  for (let i = 0; i < 10; i++) {
    const chainLen = 3 + Math.floor(sr() * 3); // 3-5 numbers
    const chain = [];
    let running = Math.floor(sr() * 20) + 5;
    chain.push(running);
    for (let j = 1; j < chainLen; j++) {
      const val = Math.floor(sr() * 9) + 1;
      if (running > val && sr() < 0.5) {
        chain.push(-val);
        running -= val;
      } else {
        chain.push(val);
        running += val;
      }
    }
    qs.push({ chain, answer: chain.reduce((a, b) => a + b, 0) });
  }

  return { questions: qs, level: levelKey, date: today };
}

export default function DailyChallenge() {
  const { user, navigate, updateUser } = useAuth();
  const daily = storage.getDailyProgress(user.id);
  const todayDone = daily?.date === new Date().toDateString() && daily?.completed;

  const [phase, setPhase] = useState(todayDone ? 'done' : 'intro');
  const [dailyData] = useState(() => generateDailyChains(user.id));
  const [qIndex, setQIndex] = useState(0);
  const [sorobanVal, setSorobanVal] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [results, setResults] = useState([]);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_Q);
  const [feedback, setFeedback] = useState(null);
  const [answering, setAnswering] = useState(false);
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    if (!timerActive || answering) return;
    if (timeLeft <= 0) { submitAnswer(true); return; }
    const t = setTimeout(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [timerActive, timeLeft, answering]);

  const startChallenge = () => {
    setPhase('play');
    setQIndex(0);
    setResults([]);
    setTimeLeft(TIME_PER_Q);
    setTimerActive(true);
    setResetKey((k) => k + 1);
  };

  const submitAnswer = useCallback((timedOut = false) => {
    if (answering) return;
    const q = dailyData.questions[qIndex];
    const correct = !timedOut && sorobanVal === q.answer;
    const res = { ...q, userAnswer: timedOut ? 'Time!' : sorobanVal, correct, timedOut };

    setTimerActive(false);
    setFeedback(correct ? 'correct' : 'wrong');
    setAnswering(true);

    setTimeout(() => {
      const newResults = [...results, res];
      if (qIndex + 1 >= dailyData.questions.length) {
        const correctCount = newResults.filter((r) => r.correct).length;
        const xpGained = calcXP(correctCount, newResults.length, dailyData.level, 50);
        storage.addScore(user.id, {
          mode: 'Daily Challenge',
          correct: correctCount,
          total: newResults.length,
          xpGained,
          level: dailyData.level,
        });
        storage.setDailyProgress(user.id, { completed: true, correct: correctCount, total: newResults.length, xpGained });
        updateUser({ xp: (user.xp || 0) + xpGained });
        setResults(newResults);
        setPhase('results');
      } else {
        setQIndex(qIndex + 1);
        setTimeLeft(TIME_PER_Q);
        setResetKey((k) => k + 1);
        setSorobanVal(0);
        setFeedback(null);
        setTimerActive(true);
      }
      setAnswering(false);
    }, 1000);
  }, [answering, sorobanVal, qIndex, results, dailyData, user]);

  const timerPct = (timeLeft / TIME_PER_Q) * 100;
  const timerColor = timerPct > 50 ? 'var(--success)' : timerPct > 25 ? 'var(--gold)' : 'var(--danger)';

  // ── ALREADY DONE ──
  if (phase === 'done') {
    return (
      <div className="page-content">
        <div className="practice-header">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('student-dashboard')}>← Back</button>
        </div>
        <div className="results-card">
          <div style={{ fontSize: '4rem', marginBottom: 12 }}><span className="material-icons-round" style={{ fontSize: 'inherit' }}>emoji_events</span></div>
          <div className="results-label">Today's Challenge Complete!</div>
          <div className="results-sub">
            You scored {daily.correct}/{daily.total} • +{daily.xpGained} XP
          </div>
          <div style={{ marginTop: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Come back tomorrow for a new challenge!
          </div>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => navigate('practice')}>Practice Instead</button>
            <button className="btn btn-ghost" onClick={() => navigate('student-dashboard')}>← Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  // ── INTRO ──
  if (phase === 'intro') {
    return (
      <div className="page-content">
        <div className="practice-header">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('student-dashboard')}>← Back</button>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Daily Challenge</h2>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: 36 }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 12 }}><span className="material-icons-round" style={{ fontSize: 'inherit' }}>emoji_events</span></div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 8 }}>Today's Challenge</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.9rem' }}>
            {LEVELS[dailyData.level]?.name} • 10 chain questions • {TIME_PER_Q}s each
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 28 }}>
            <div className="stat-card">
              <div className="stat-value text-accent">10</div>
              <div className="stat-label">Questions</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--teal)' }}>{TIME_PER_Q}s</div>
              <div className="stat-label">Per Question</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-success">+50</div>
              <div className="stat-label">Bonus XP</div>
            </div>
          </div>

          <button className="btn btn-primary btn-lg" onClick={startChallenge}>
            <span className="material-icons-round" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 4 }}>play_arrow</span> Start Challenge!
          </button>
        </div>
      </div>
    );
  }

  // ── PLAY ──
  if (phase === 'play') {
    const q = dailyData.questions[qIndex];

    return (
      <div className="page-content">
        <div className="practice-header">
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}><span className="material-icons-round" style={{ fontSize: 18, verticalAlign: 'middle' }}>emoji_events</span> Daily Challenge</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {qIndex + 1} / {dailyData.questions.length}
          </span>
        </div>

        {/* Timer bar */}
        <div className="timer-bar-wrap" style={{ height: 10, marginBottom: 16 }}>
          <div className="timer-bar" style={{ width: `${timerPct}%`, background: timerColor, transition: 'width 1s linear, background 1s linear' }} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: timerColor, fontFamily: 'monospace', transition: 'color 1s linear' }}>
            {timeLeft}s
          </span>
        </div>

        {/* Question — chain display */}
        <div className="question-card">
          <div className="question-counter">Question {qIndex + 1} of {dailyData.questions.length}</div>
          <div className="chain-display horizontal">
            {q.chain.map((n, i) => (
              <span key={i} className={`chain-num-large ${n < 0 ? 'negative' : 'positive'}`}>
                {i > 0 && n >= 0 ? '+' : ''}{n}
              </span>
            ))}
          </div>
          <div className="question-prompt">Set the answer on your Abacus</div>
        </div>

        {feedback && (
          <div className={`answer-feedback ${feedback}`}>
            {feedback === 'correct' ? '✓ Correct!' : `✗ Answer was ${q.answer}`}
          </div>
        )}

        <Soroban onValueChange={setSorobanVal} resetKey={resetKey} disabled={answering} />

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <button className="btn btn-gold btn-lg" onClick={() => submitAnswer(false)} disabled={answering}>
            Submit ({sorobanVal})
          </button>
        </div>
      </div>
    );
  }

  // ── RESULTS ──
  const correctCount = results.filter((r) => r.correct).length;
  const pct = Math.round((correctCount / results.length) * 100);
  const grade = getGrade(pct);
  const xpGained = calcXP(correctCount, results.length, dailyData.level, 50);

  return (
    <div className="page-content">
      <div className="results-card">
        <div style={{ fontSize: '3rem', marginBottom: 8 }}><span className="material-icons-round" style={{ fontSize: 'inherit' }}>emoji_events</span></div>
        <div className={`results-score ${grade.cls}`}>{pct}%</div>
        <div className="results-label">{grade.label}</div>
        <div className="results-sub">
          {correctCount}/{results.length} correct • +{xpGained} XP (incl. daily bonus)
        </div>
        <div className="results-detail-list" style={{ marginTop: 20 }}>
          {results.map((r, i) => (
            <div key={i} className={`result-item ${r.correct ? 'correct' : 'wrong'}`}>
              <span className="result-item-q">
                {r.chain.map((n, ni) => (
                  <span key={ni}>{ni > 0 ? (n >= 0 ? ' + ' : ' − ') : ''}{ni > 0 ? Math.abs(n) : n}</span>
                ))} = {r.answer}
              </span>
              <span className="result-item-info">
                {r.correct ? '✓' : r.timedOut ? <><span className="material-icons-round" style={{ fontSize: 14, verticalAlign: 'middle' }}>timer</span> Timed out</> : `✗ You: ${r.userAnswer}`}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate('practice')}>Continue Practicing</button>
          <button className="btn btn-ghost" onClick={() => navigate('student-dashboard')}>← Dashboard</button>
        </div>
      </div>
    </div>
  );
}
