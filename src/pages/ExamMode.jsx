import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth, storage } from "../contexts/AuthContext";
import {
  solveChain,
  calcXP,
  getGrade,
  LEVELS,
  capExamChains,
} from "../utils/questions";

// ─── IndexedDB helpers for video storage ────────────────────
const DB_NAME = "AbacusExamDB";
const OLD_DB_NAME = "MindMantraExamDB"; // fallback for previously-saved recordings
const STORE_NAME = "recordings";
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== "false";

const DB_VERSION = 2;

function openDB(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Create the store if it's missing. Bumping the version forces this to
      // run on existing DBs that were created without the store (which silently
      // broke every recording save).
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Last-resort guard: if the store still isn't there, reopen at a higher
      // version to trigger another upgrade.
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const v = db.version + 1;
        db.close();
        const req2 = indexedDB.open(name, v);
        req2.onupgradeneeded = () => {
          const db2 = req2.result;
          if (!db2.objectStoreNames.contains(STORE_NAME)) {
            db2.createObjectStore(STORE_NAME);
          }
        };
        req2.onsuccess = () => resolve(req2.result);
        req2.onerror = () => reject(req2.error);
        return;
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function saveRecording(key, blob) {
  if (!DEMO_MODE) {
    // upload to server
    try {
      const fd = new FormData();
      fd.append("recording", blob, `${key}.webm`);
      const resp = await fetch("/api/recordings", { method: "POST", body: fd });
      if (!resp.ok) throw new Error("upload failed");
      const data = await resp.json();
      // server returns a key; store that mapping locally as well
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(data.key, key + "__server");
        tx.oncomplete = () => resolve(data.key);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      // fallback to local DB
    }
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(blob, key);
      tx.oncomplete = () => resolve(key);
      tx.onerror = () => reject(tx.error);
    } catch (e) {
      // store missing / DB in a bad state — surface it instead of hanging
      reject(e);
    }
  });
}

export async function getRecording(key) {
  // Try server if not demo mode
  if (!DEMO_MODE) {
    try {
      // If we previously stored a server mapping under key+'__server', fetch it
      const dbLocal = await openDB();
      try {
        const serverMap = await new Promise((res, rej) => {
          const tx = dbLocal.transaction(STORE_NAME, "readonly");
          const r = tx.objectStore(STORE_NAME).get(key + "__server");
          r.onsuccess = () => res(r.result || null);
          r.onerror = () => rej(r.error);
        });
        if (serverMap) {
          const url = `/api/recordings/${serverMap}`;
          const resp = await fetch(url);
          if (resp.ok) return await resp.blob();
        }
      } catch (e) {
        // continue to try direct server get
      }
      const resp = await fetch(`/api/recordings/${key}`);
      if (resp.ok) return await resp.blob();
    } catch (e) {
      // fallback to DB reads below
    }
  }
  // Try current DB first
  try {
    const db = await openDB(DB_NAME);
    const maybe = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (maybe) return maybe;
  } catch (e) {
    // ignore and fallback
  }

  // Fallback to legacy DB name (if recordings exist there)
  try {
    const oldDb = await openDB(OLD_DB_NAME);
    return await new Promise((resolve, reject) => {
      const tx = oldDb.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

// ─── Text-to-Speech for chain dictation ─────────────────────
// Pre-warm voices (mobile browsers load voices lazily)
if ("speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () =>
    window.speechSynthesis.getVoices();
}

function speakChain(chain) {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();

  const parts = chain.map((n, i) => {
    if (i === 0) return String(Math.abs(n));
    if (n >= 0) return `plus ${n}`;
    return `minus ${Math.abs(n)}`;
  });

  const utterance = new SpeechSynthesisUtterance(parts.join(" ... "));
  utterance.rate = 0.85;
  utterance.pitch = 1;
  utterance.lang = "en-IN";

  // Try to pick an English voice explicitly (helps on mobile)
  const voices = window.speechSynthesis.getVoices();
  const enVoice =
    voices.find((v) => v.lang.startsWith("en-IN")) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0];
  if (enVoice) utterance.voice = enVoice;

  window.speechSynthesis.speak(utterance);
  return true;
}

// ─── Voice-answer parsing (Speech-to-Text) ──────────────────
// Collapse spoken number-words ("twenty five") into digits ("25")
// so the rest of the parser only has to deal with numerals.
function wordsToNumbers(str) {
  const units = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19,
  };
  const tens = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
    eighty: 80, ninety: 90,
  };
  const tokens = str.split(/\s+/);
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur !== null) out.push(String(cur));
    cur = null;
  };
  for (const tok of tokens) {
    if (tok in units) cur = (cur || 0) + units[tok];
    else if (tok in tens) cur = (cur || 0) + tens[tok];
    else if (tok === "hundred") cur = (cur || 1) * 100;
    else {
      flush();
      if (tok) out.push(tok);
    }
  }
  flush();
  return out.join(" ");
}

// Split a concatenated "q260" / "q125" digit run into {qNum, answer}.
// Speech recognition often drops the space between the question number and
// the answer, so we use the section's question count to find the split.
// Single-digit question numbers are preferred (most sections have < 10 Qs).
function splitConcatVoice(digits, qCount) {
  const max = qCount || 99;
  for (let len = 1; len <= 2 && len < digits.length; len++) {
    const qNum = parseInt(digits.slice(0, len), 10);
    if (qNum >= 1 && qNum <= max) {
      const answer = parseInt(digits.slice(len), 10);
      if (!isNaN(answer)) return { qNum, answer };
    }
  }
  return null;
}

const PASS_WORDS = /^(pass|skip|leave|blank)$/;
const CANCEL_WORDS = /^(cancel|clear|restart|again|wrong|redo|delete|remove|reset)$/;

// Parse spoken commands. Returns { cmds, matched }.
//   cmds:    [{ qNum, answer|null, action }]  action: "answer" | "pass" | "cancel"
//   matched: true if at least one "Q<number>" pattern was found (so we can
//            tell a genuine command attempt apart from pure random talk).
// Supports: "Q1 25", "q125", "q260", "question 2 minus 5", "Q10 pass",
//           "Q4 cancel" / "cancel Q4" / "Q4 wrong" (clear & redo).
// Case-insensitive. Anything that isn't a Q-command leaves matched=false.
function parseVoiceCommands(raw, qCount) {
  let t = raw.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
  // normalise the various ways "Q" gets transcribed as a whole word
  t = t.replace(/\b(questions?|queue|cue|kew|kyu|que)\b/g, "q");
  t = wordsToNumbers(t);
  // "Q<n>" is very often mis-heard as "you 1", "u 1", "yu 1", "cue 1", etc.
  // Map those to "q" ONLY when immediately followed by a number, so normal
  // words like "you" in chatter aren't affected.
  t = t.replace(/\b(you|u|yu|ewe|hugh|cue|queue|que|q)\s*(?=\d)/g, "q");
  // optional keyword BEFORE q (e.g. "cancel q4"), then q + number, then an
  // optional keyword AFTER q (pass/cancel), optional sign, optional answer.
  const re =
    /(cancel|clear|restart|again|wrong|redo|delete|remove|reset)?\s*q\s*(\d+)\s*(pass|skip|leave|blank|cancel|clear|restart|again|wrong|redo|delete|remove|reset)?\s*(minus|negative|-)?\s*(\d+)?/g;
  const cmds = [];
  let matched = false;
  let m;
  while ((m = re.exec(t)) !== null) {
    matched = true;
    const pre = m[1];
    const digits = m[2];
    const post = m[3];
    const sign = m[4] ? -1 : 1;
    const spacedAns = m[5];

    const isCancel =
      (pre && CANCEL_WORDS.test(pre)) || (post && CANCEL_WORDS.test(post));
    const isPass = post && PASS_WORDS.test(post);

    if (isCancel) {
      cmds.push({ qNum: parseInt(digits, 10), answer: null, action: "cancel" });
      continue;
    }
    if (isPass) {
      cmds.push({ qNum: parseInt(digits, 10), answer: null, action: "pass" });
      continue;
    }
    if (spacedAns != null) {
      // "q2 60" / "q2 minus 5" — question and answer were separated
      cmds.push({
        qNum: parseInt(digits, 10),
        answer: sign * parseInt(spacedAns, 10),
        action: "answer",
      });
      continue;
    }
    // "q260" — concatenated; needs qCount to split.
    const split = splitConcatVoice(digits, qCount);
    if (split) {
      cmds.push({
        qNum: split.qNum,
        answer: sign * split.answer,
        action: "answer",
      });
    } else {
      // Couldn't split into an in-range question — likely an out-of-range
      // question number (e.g. "q890" → Q8 in a 7-question section). Report the
      // leading digit so the caller can warn the student.
      cmds.push({
        qNum: parseInt(digits.slice(0, 1), 10),
        answer: null,
        action: "answer",
      });
    }
  }
  return { cmds, matched };
}

// ─── MAIN COMPONENT ─────────────────────────────────────────
export default function ExamMode() {
  const { user, navigate, pageProps, updateUser } = useAuth();
  // Cap any runaway chains from older saved exams so questions stay sane.
  const exam = useMemo(
    () => capExamChains(pageProps?.exam),
    [pageProps?.exam],
  );

  const [phase, setPhase] = useState("intro");
  const [sectionIdx, setSectionIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(exam?.totalTime || 1200);
  const [timerActive, setTimerActive] = useState(false);
  const [speakingQ, setSpeakingQ] = useState(null);
  const inputRefs = useRef({});

  // Voice-answer (speech-to-text) state
  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [voiceAlert, setVoiceAlert] = useState(""); // warnings / out-of-range
  const [voiceLocked, setVoiceLocked] = useState(false); // 10s off-topic penalty
  const [lockSecs, setLockSecs] = useState(0);
  const voiceSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const recognitionRef = useRef(null);
  const listeningRef = useRef(false);
  const sectionIdxRef = useRef(0);
  const randomCountRef = useRef(0); // consecutive off-topic utterances
  const lockedRef = useRef(false);
  const lockTimerRef = useRef(null);
  const alertTimerRef = useRef(null); // auto-dismiss warnings
  const restartTimerRef = useRef(null); // delayed recognition restart
  const answerTimeRef = useRef({}); // qKey → ms when first answered (1s lock)

  // Abandon / cancel exam (needs teacher approval)
  const [showAbandon, setShowAbandon] = useState(false);
  const [abandonReason, setAbandonReason] = useState("");
  const [abandonErr, setAbandonErr] = useState("");
  const [submittingAbandon, setSubmittingAbandon] = useState(false);

  // Camera / Recording state
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recorderMimeRef = useRef("video/webm");
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [recordingKey, setRecordingKey] = useState(null);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [showPlayback, setShowPlayback] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [openSections, setOpenSections] = useState({});

  // Draggable camera PiP
  const pipRef = useRef(null);
  const pipDrag = useRef(null);
  const [pipPos, setPipPos] = useState(null);

  const handlePipPointerDown = (e) => {
    if (e.target.closest("video")) return; // don't interfere with video tap
    const el = pipRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    pipDrag.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
  };
  const handlePipPointerMove = (e) => {
    if (!pipDrag.current) return;
    const dx = e.clientX - pipDrag.current.startX;
    const dy = e.clientY - pipDrag.current.startY;
    const newLeft = Math.max(
      0,
      Math.min(window.innerWidth - 90, pipDrag.current.startLeft + dx),
    );
    const newTop = Math.max(
      0,
      Math.min(window.innerHeight - 70, pipDrag.current.startTop + dy),
    );
    setPipPos({ top: newTop, left: newLeft });
  };
  const handlePipPointerUp = () => {
    pipDrag.current = null;
  };

  // Timer
  useEffect(() => {
    if (!timerActive) return;
    if (timeLeft <= 0) {
      finishExam();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timerActive, timeLeft]);

  // Keep the latest section index available to the speech callback.
  // Reset the off-topic streak on each new section so warnings don't carry over.
  useEffect(() => {
    sectionIdxRef.current = sectionIdx;
    randomCountRef.current = 0;
  }, [sectionIdx]);

  // Auto-advance to the next section ONLY once every question in the current
  // section is answered ("PASS" counts as answered). Last section stays put.
  useEffect(() => {
    if (phase !== "play") return;
    const sec = exam?.sections?.[sectionIdx];
    if (!sec) return;
    const allAnswered = sec.questions.every(
      (_, qi) => (answers[`${sectionIdx}-${qi}`] || "") !== "",
    );
    if (allAnswered && sectionIdx < (exam.sections.length || 0) - 1) {
      const t = setTimeout(() => {
        setSectionIdx((i) => (i === sectionIdx ? i + 1 : i));
      }, 900);
      return () => clearTimeout(t);
    }
  }, [answers, sectionIdx, phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      window.speechSynthesis?.cancel();
      listeningRef.current = false;
      lockedRef.current = false;
      clearInterval(lockTimerRef.current);
      clearTimeout(alertTimerRef.current);
      clearTimeout(restartTimerRef.current);
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // ── Camera helpers ──
  const startCamera = async () => {
    try {
      // Check permission state first — if denied, browser won't re-prompt
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const perm = await navigator.permissions.query({ name: "camera" });
          if (perm.state === "denied") {
            setCameraError(
              "Camera permission is blocked. Click the camera/lock icon in the address bar → Allow camera → then click Enable Camera again.",
            );
            setCameraReady(false);
            return;
          }
        } catch {
          // permissions.query may not support 'camera' in all browsers — continue anyway
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320, height: 240 },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraReady(true);
      setCameraError("");

      // Start recording
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : MediaRecorder.isTypeSupported("video/mp4")
          ? "video/mp4"
          : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderMimeRef.current = recorder.mimeType || mimeType || "video/webm";
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = (e) => {
        console.warn("[exam recording] recorder error:", e.error || e);
      };
      // Smaller timeslice → a chunk lands quickly even on very short attempts.
      recorder.start(500);
      mediaRecorderRef.current = recorder;
    } catch (err) {
      const msg =
        err.name === "NotAllowedError"
          ? "Camera permission is blocked. Click the camera/lock icon in the address bar → Allow camera → then click Enable Camera again."
          : err.name === "NotFoundError"
            ? "No camera found on this device."
            : `Camera not available: ${err.message}`;
      setCameraError(msg);
      setCameraReady(false);
    }
  };

  const stopCamera = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  // Flush and stop the recorder, resolving only AFTER its final chunk lands.
  // Without this the last (and for short exams, only) chunk can arrive after we
  // build the blob, producing an empty recording with no key. A timeout
  // guarantees we never hang if onstop doesn't fire.
  const stopRecording = () =>
    new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === "inactive") {
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      rec.onstop = finish;
      try {
        rec.requestData();
      } catch {
        /* not all browsers support requestData */
      }
      try {
        rec.stop();
      } catch {
        finish();
      }
      setTimeout(finish, 1500); // safety net
    });

  const saveRecordingData = async () => {
    // Make sure the recorder has flushed before we read its chunks.
    await stopRecording();
    if (chunksRef.current.length === 0) {
      console.warn(
        "[exam recording] no video chunks captured — recording not saved.",
      );
      return null;
    }
    const blob = new Blob(chunksRef.current, {
      type: recorderMimeRef.current || "video/webm",
    });
    const key = `exam_${user.id}_${exam.id}_${Date.now()}`;
    try {
      await saveRecording(key, blob);
      return key;
    } catch (e) {
      console.warn("[exam recording] failed to save:", e);
      return null;
    }
  };

  // ── Speech helper ──
  const handleSpeak = (chain, qKey) => {
    if (speakingQ === qKey) {
      window.speechSynthesis?.cancel();
      setSpeakingQ(null);
    } else {
      // On mobile, a user gesture is required — trigger a silent utterance first if needed
      if (!window.speechSynthesis?.speaking) {
        const warmup = new SpeechSynthesisUtterance("");
        warmup.volume = 0;
        window.speechSynthesis?.speak(warmup);
      }
      const ok = speakChain(chain);
      if (!ok) return;
      setSpeakingQ(qKey);
      const checkDone = setInterval(() => {
        if (!window.speechSynthesis?.speaking) {
          setSpeakingQ(null);
          clearInterval(checkDone);
        }
      }, 300);
    }
  };

  // ── Voice answer (speech-to-text) ──
  // 10-second penalty lockout after 5 off-topic utterances.
  const triggerLockout = () => {
    lockedRef.current = true;
    randomCountRef.current = 0;
    setVoiceLocked(true);
    setVoiceAlert("");
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    let secs = 5;
    setLockSecs(secs);
    clearInterval(lockTimerRef.current);
    lockTimerRef.current = setInterval(() => {
      secs -= 1;
      setLockSecs(secs);
      if (secs <= 0) {
        clearInterval(lockTimerRef.current);
        lockedRef.current = false;
        setVoiceLocked(false);
        // resume listening with a fresh recognition instance
        if (listeningRef.current) spawnRecognition();
      }
    }, 1000);
  };

  const applyVoice = (transcript) => {
    if (lockedRef.current) return; // ignore everything during a penalty lockout
    const sIdx = sectionIdxRef.current;
    const qCount = sections[sIdx]?.questions.length || 0;
    const { cmds, matched } = parseVoiceCommands(transcript, qCount);

    const done = [];
    const cleared = [];
    const outOfRange = [];
    const lockedQ = [];

    cmds.forEach((c) => {
      // 1. out-of-range question → alert, don't fill
      if (c.qNum < 1 || c.qNum > qCount) {
        outOfRange.push(c.qNum);
        return;
      }
      const qIdx = c.qNum - 1;
      const qKey = `${sIdx}-${qIdx}`;

      // "Q4 cancel" → clear and UNLOCK so the student can answer again,
      // even if it was already locked. This is the wrong-answer escape hatch.
      if (c.action === "cancel") {
        setAnswerVal(sIdx, qIdx, "");
        delete answerTimeRef.current[qKey];
        cleared.push(c.qNum);
        return;
      }

      // incomplete ("q4" with no answer/pass) → ignore silently
      if (c.action !== "pass" && (c.answer == null || isNaN(c.answer))) return;

      // 4. once answered, lock the value 1 second later
      const firstAt = answerTimeRef.current[qKey];
      if (firstAt && Date.now() - firstAt > 1000) {
        lockedQ.push(c.qNum);
        return;
      }
      if (c.action === "pass") setAnswerVal(sIdx, qIdx, "PASS");
      else setAnswerVal(sIdx, qIdx, String(c.answer));
      if (!firstAt) answerTimeRef.current[qKey] = Date.now();
      done.push(
        c.action === "pass" ? `Q${c.qNum} passed` : `Q${c.qNum} = ${c.answer}`,
      );
    });

    if (done.length || cleared.length) {
      randomCountRef.current = 0; // a real action clears the off-topic streak
      setVoiceAlert("");
    }
    if (cleared.length) {
      setVoiceText(
        `↺ Q${cleared[0]} cleared — say the answer again (e.g. "Q${cleared[0]} 25").`,
      );
    } else if (done.length) {
      setVoiceText(`✓ ${done.join(",  ")}`);
    }

    // Warnings never block the exam — they auto-dismiss so listening continues.
    if (outOfRange.length) {
      showVoiceAlert(
        `⚠ Question ${outOfRange[0]} is not in this exam — there are only ${qCount} questions here. Keep going with Q1–Q${qCount}.`,
      );
    } else if (lockedQ.length) {
      showVoiceAlert(
        `🔒 Q${lockedQ[0]} is locked. If it's wrong, say "Q${lockedQ[0]} cancel" to clear it and answer again.`,
      );
    } else if (!matched && !done.length && !cleared.length) {
      // 2. random / off-topic talk → warn, lock voice for 10s after 5 strikes
      const hasWords = /[a-z]{2,}/.test(transcript.toLowerCase());
      if (hasWords) {
        randomCountRef.current += 1;
        if (randomCountRef.current >= 8) {
          triggerLockout();
        } else {
          showVoiceAlert(
            `⚠ Please say answers only, like "Q1 25". Off-topic ${randomCountRef.current}/8 — voice will pause at 8.`,
          );
        }
      }
    }
  };

  // Show a transient warning that auto-clears so the exam never feels stuck.
  const showVoiceAlert = (msg) => {
    setVoiceAlert(msg);
    clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setVoiceAlert(""), 4500);
  };

  // Build + start a FRESH recognition instance. Chrome's SpeechRecognition
  // stops itself on silence/no-speech/network errors (very common during a long
  // section like "Do with Mentally"); reusing the same instance to restart often
  // throws InvalidStateError. Spawning a new one each time is far more reliable.
  const spawnRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) applyVoice(r[0].transcript);
        else interim += r[0].transcript;
      }
      if (interim) {
        setVoiceText(`“${interim.trim()}”`);
        setVoiceAlert(""); // they're talking again — drop any stale warning
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        listeningRef.current = false;
        setListening(false);
        setVoiceText("Microphone blocked — allow mic access to use voice.");
      }
      // no-speech / aborted / network → let onend respawn a fresh instance
    };
    rec.onend = () => {
      if (!listeningRef.current || lockedRef.current) return;
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (listeningRef.current && !lockedRef.current) spawnRecognition();
      }, 350);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      // start can throw if a previous instance is mid-teardown — retry fresh
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = setTimeout(() => {
        if (listeningRef.current && !lockedRef.current) spawnRecognition();
      }, 500);
    }
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    listeningRef.current = true;
    setListening(true);
    setVoiceText("");
    spawnRecognition();
  };

  const stopVoice = () => {
    listeningRef.current = false;
    lockedRef.current = false;
    clearInterval(lockTimerRef.current);
    clearTimeout(alertTimerRef.current);
    clearTimeout(restartTimerRef.current);
    setListening(false);
    setVoiceLocked(false);
    setVoiceText("");
    setVoiceAlert("");
    randomCountRef.current = 0;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
  };

  const toggleVoice = () => (listening ? stopVoice() : startVoice());

  if (!exam) {
    return (
      <div className="page-content">
        <div className="results-card">
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>
            <span
              className="material-icons-round"
              style={{ fontSize: "inherit" }}
            >
              error_outline
            </span>
          </div>
          <div className="results-label">No Exam Selected</div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => navigate("student-dashboard")}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const sections = exam.sections || [];
  const currentSection = sections[sectionIdx];

  const startExam = async () => {
    // Demo cap: only one exam attempt per device
    if (storage.demo.capReached("attempts")) {
      setPhase("demo-locked");
      return;
    }
    storage.demo.bump("attempts");
    setPhase("play");
    setSectionIdx(0);
    setAnswers({});
    answerTimeRef.current = {};
    randomCountRef.current = 0;
    setTimeLeft(exam.totalTime || 1200);
    setTimerActive(true);
    // Start the mic immediately (within this click gesture) so the student
    // can speak answers right away without hunting for the Voice button.
    if (voiceSupported) startVoice();
    await startCamera();
  };

  const setAnswerVal = (sIdx, qIdx, value) => {
    setAnswers((prev) => ({ ...prev, [`${sIdx}-${qIdx}`]: value }));
  };

  const getAnswer = (sIdx, qIdx) => answers[`${sIdx}-${qIdx}`] || "";

  const finishExam = async () => {
    setTimerActive(false);
    window.speechSynthesis?.cancel();
    stopVoice();

    // Save first (flushes the recorder), THEN stop the camera tracks.
    const recKey = await saveRecordingData();
    stopCamera();
    setRecordingKey(recKey);

    setPhase("results");

    let totalCorrect = 0,
      totalQuestions = 0,
      totalMarks = 0,
      maxMarks = 0;

    sections.forEach((section, sIdx) => {
      const marksEach = section.marksEach || 1;
      section.questions.forEach((q, qIdx) => {
        totalQuestions++;
        maxMarks += marksEach;
        const userAns = parseInt(getAnswer(sIdx, qIdx), 10);
        const correctAns = q.answer != null ? q.answer : solveChain(q.chain);
        if (userAns === correctAns) {
          totalCorrect++;
          totalMarks += marksEach;
        }
      });
    });

    const xpGained = calcXP(
      totalCorrect,
      totalQuestions,
      exam.level || "basic",
    );
    const result = {
      examId: exam.id,
      examTitle: exam.title || exam.levelName || "Exam",
      level: exam.level,
      totalCorrect,
      totalQuestions,
      totalMarks,
      maxMarks,
      xpGained,
      timeUsed: (exam.totalTime || 1200) - timeLeft,
      recordingKey: recKey,
      studentName: user.name,
      studentId: user.id,
    };

    storage.addExamResult(user.id, result);
    storage.addScore(user.id, {
      mode: `Exam: ${result.examTitle}`,
      correct: totalCorrect,
      total: totalQuestions,
      xpGained,
      level: exam.level,
    });
    updateUser({ xp: (user.xp || 0) + xpGained });
  };

  // ── Abandon exam — log a request for teacher approval, then exit ──
  const submitAbandon = async () => {
    if (abandonReason.trim().length < 5) {
      setAbandonErr("Please give a valid reason (at least 5 characters).");
      return;
    }
    setSubmittingAbandon(true);
    setTimerActive(false);
    window.speechSynthesis?.cancel();
    stopVoice();

    // Save first (flushes the recorder), THEN stop the camera tracks.
    const recKey = await saveRecordingData();
    stopCamera();
    const answered = Object.keys(answers).filter((k) => answers[k] !== "")
      .length;
    const totalQ = sections.reduce((s, sec) => s + sec.questions.length, 0);

    storage.addExamRequest({
      type: "abandon",
      studentId: user.id,
      studentName: user.name,
      teacherId: user.teacherId || null,
      examId: exam.id,
      examTitle: exam.title || exam.levelName || "Exam",
      reason: abandonReason.trim(),
      recordingKey: recKey,
      answered,
      totalQuestions: totalQ,
      timeUsed: (exam.totalTime || 1200) - timeLeft,
    });

    setShowAbandon(false);
    setSubmittingAbandon(false);
    navigate("student-dashboard", {
      flash: "Your request to cancel the exam was sent to your teacher for approval.",
    });
  };

  const handleViewRecording = async (key) => {
    const recKey = key || recordingKey;
    if (!recKey) return;
    try {
      const blob = await getRecording(recKey);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setPlaybackUrl(url);
        setShowPlayback(true);
      }
    } catch {
      /* ignore */
    }
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const answeredCount = Object.keys(answers).filter(
    (k) => answers[k] !== "",
  ).length;
  const totalQCount = sections.reduce((s, sec) => s + sec.questions.length, 0);

  // ── INTRO ─────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div className="page-content">
        <div className="practice-header">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate("student-dashboard")}
          >
            ← Back
          </button>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Exam</h2>
        </div>

        <div className="card" style={{ textAlign: "center", padding: 36 }}>
          <div style={{ fontSize: "3.5rem", marginBottom: 12 }}>
            <span
              className="material-icons-round"
              style={{ fontSize: "inherit" }}
            >
              assignment
            </span>
          </div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 8 }}>
            {exam.title || exam.levelName || "Monthly Test Paper"}
          </h2>

          {/* Student name prominently */}
          <div
            style={{
              background: "var(--accent-dim)",
              borderRadius: 8,
              padding: "8px 16px",
              display: "inline-block",
              marginBottom: 12,
            }}
          >
            <span
              className="material-icons-round"
              style={{
                fontSize: 16,
                verticalAlign: "middle",
                marginRight: 4,
                color: "var(--accent)",
              }}
            >
              person
            </span>
            <strong style={{ color: "var(--accent)" }}>{user.name}</strong>
          </div>

          <p style={{ color: "var(--text-muted)", marginBottom: 4 }}>
            {LEVELS[exam.level]?.name || exam.level} Level
          </p>
          <p
            style={{
              color: "var(--text-muted)",
              marginBottom: 24,
              fontSize: "0.9rem",
            }}
          >
            {totalQCount} questions • {formatTime(exam.totalTime || 1200)} time
            limit • {exam.fullMarks || 80} marks
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 28,
            }}
          >
            {sections.map((sec, i) => (
              <div key={i} className="stat-card">
                <div className="stat-value text-accent">
                  {sec.questions.length}
                </div>
                <div className="stat-label" style={{ fontSize: "0.7rem" }}>
                  {sec.name}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              background: "var(--bg)",
              borderRadius: 10,
              padding: 16,
              marginBottom: 24,
              textAlign: "left",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
            }}
          >
            <strong style={{ color: "var(--text)" }}>Instructions:</strong>
            <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
              <li>Each question shows a chain of numbers to add/subtract</li>
              <li>Type your answer in the box below each question</li>
              <li>
                Tap{" "}
                <span
                  className="material-icons-round"
                  style={{ fontSize: 14, verticalAlign: "middle" }}
                >
                  volume_up
                </span>{" "}
                to hear the question read aloud
              </li>
              <li>
                Or tap{" "}
                <span
                  className="material-icons-round"
                  style={{ fontSize: 14, verticalAlign: "middle" }}
                >
                  mic
                </span>{" "}
                <strong style={{ color: "var(--text)" }}>Voice Fill</strong> and
                say the answer aloud — e.g. "Q1 25", "Q3 pass" to skip, or "Q1
                cancel" to clear a wrong answer and redo it
              </li>
              <li>Navigate between sections using tabs</li>
              <li>
                <strong style={{ color: "var(--danger)" }}>
                  Camera will record during exam
                </strong>
              </li>
            </ul>
          </div>

          {storage.demo.capReached("attempts") ? (
            <div
              style={{
                background: "var(--gold-dim)",
                border: "1px solid var(--gold)",
                borderRadius: 10,
                padding: "14px 16px",
                color: "var(--text)",
                fontSize: "0.9rem",
                textAlign: "center",
              }}
            >
              <span
                className="material-icons-round"
                style={{
                  fontSize: 18,
                  verticalAlign: "middle",
                  marginRight: 6,
                  color: "var(--gold-hover)",
                }}
              >
                lock
              </span>
              Demo limit reached — this device has already completed one exam
              attempt. Contact us for full access.
            </div>
          ) : (
            <button
              className="btn btn-primary btn-lg btn-full"
              onClick={startExam}
            >
              <span
                className="material-icons-round"
                style={{
                  fontSize: 18,
                  verticalAlign: "middle",
                  marginRight: 4,
                }}
              >
                play_arrow
              </span>
              Start Exam
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── DEMO LOCKED (attempt cap reached) ─────────────────────
  if (phase === "demo-locked") {
    return (
      <div className="page-content">
        <div className="results-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>
            <span
              className="material-icons-round"
              style={{ fontSize: "inherit", color: "var(--gold-hover)" }}
            >
              lock
            </span>
          </div>
          <div className="results-label">Demo limit reached</div>
          <p
            style={{
              color: "var(--text-muted)",
              margin: "8px 0 20px",
              fontSize: "0.9rem",
            }}
          >
            This device has already completed one exam attempt in the demo.
            Please contact us to unlock full, unlimited access.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate("student-dashboard")}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── PLAY ──────────────────────────────────────────────────
  if (phase === "play") {
    const timerPct = (timeLeft / (exam.totalTime || 1200)) * 100;
    const timerColor =
      timerPct > 50
        ? "var(--success)"
        : timerPct > 25
          ? "var(--gold)"
          : "var(--danger)";

    return (
      <div className="page-content">
        {/* Camera PiP — draggable floating video */}
        <div
          ref={pipRef}
          className="exam-camera-pip"
          style={
            pipPos
              ? { top: pipPos.top, left: pipPos.left, right: "auto" }
              : undefined
          }
          onPointerDown={handlePipPointerDown}
          onPointerMove={handlePipPointerMove}
          onPointerUp={handlePipPointerUp}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="exam-camera-video"
          />
          {!cameraReady && (
            <div
              className="exam-camera-placeholder"
              onClick={(e) => {
                e.stopPropagation();
                setCameraError("");
                startCamera();
              }}
              style={{ cursor: "pointer" }}
              title="Click to enable camera"
            >
              <span
                className="material-icons-round"
                style={{
                  fontSize: 20,
                  color: cameraError ? "var(--danger)" : "var(--text-muted)",
                }}
              >
                {cameraError ? "videocam_off" : "videocam"}
              </span>
              <span
                style={{
                  fontSize: "0.45rem",
                  color: cameraError ? "var(--danger)" : "var(--text-muted)",
                  marginTop: 2,
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {cameraError ? "Tap to enable" : "Starting..."}
              </span>
            </div>
          )}
          {cameraReady && (
            <div className="exam-camera-rec">
              <span className="rec-dot" /> REC
            </div>
          )}
          <div className="exam-camera-name">{user.name}</div>
        </div>

        {/* Camera error banner */}
        {cameraError && (
          <div
            style={{
              background: "var(--danger-dim)",
              border: "1px solid var(--danger)",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "0.82rem",
              color: "var(--danger)",
            }}
          >
            <span className="material-icons-round" style={{ fontSize: 18 }}>
              videocam_off
            </span>
            <span style={{ flex: 1 }}>
              Camera access denied or unavailable. The exam will continue
              without recording. Please allow camera permission to enable
              recording.
            </span>
            <button
              onClick={() => {
                setCameraError("");
                startCamera();
              }}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "5px 14px",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span className="material-icons-round" style={{ fontSize: 16 }}>
                videocam
              </span>
              Enable Camera
            </button>
          </div>
        )}

        {/* Header */}
        <div className="exam-header">
          <div className="exam-header-left">
            <span className="material-icons-round" style={{ fontSize: 18 }}>
              assignment
            </span>
            <span style={{ fontWeight: 700 }}>{exam.title || "Exam"}</span>
          </div>
          <div className="exam-timer" style={{ color: timerColor }}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>
              timer
            </span>
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Timer bar */}
        <div className="timer-bar-wrap" style={{ height: 6, marginBottom: 16 }}>
          <div
            className="timer-bar"
            style={{
              width: `${timerPct}%`,
              background: timerColor,
              transition: "width 1s linear",
            }}
          />
        </div>

        {/* Progress */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.8rem",
            color: "var(--text-muted)",
            marginBottom: 12,
          }}
        >
          <span>
            Answered: {answeredCount} / {totalQCount}
          </span>
          <span>
            {currentSection?.name} ({currentSection?.marksEach || 1} mark each)
          </span>
        </div>

        {/* Voice answer bar */}
        {voiceSupported &&
          (() => {
            // status line + colour by state: lockout > alert > success > idle
            const statusColor = voiceLocked
              ? "var(--danger)"
              : voiceAlert
                ? "var(--warn)"
                : voiceText.startsWith("✓")
                  ? "var(--success)"
                  : "var(--text-muted)";
            const borderColor = voiceLocked
              ? "var(--danger)"
              : voiceAlert
                ? "var(--warn)"
                : listening
                  ? "var(--accent)"
                  : "var(--border)";
            const statusText = voiceLocked
              ? `⏸ Voice paused for ${lockSecs}s — too much off-topic talk. Please answer only.`
              : voiceAlert
                ? voiceAlert
                : listening
                  ? voiceText ||
                    'Listening… say "Q1 25", "Q3 pass", or "Q1 cancel" to redo'
                  : voiceText ||
                    'Tap to answer by voice — say "Q1 25", "Q3 pass" to skip, or "Q1 cancel" to clear a wrong answer.';
            return (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 16,
                  background: "var(--surface)",
                  border: `1px solid ${borderColor}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  transition: "border-color 0.2s",
                }}
              >
                <button
                  onClick={toggleVoice}
                  disabled={voiceLocked}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 16px",
                    cursor: voiceLocked ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    color: "#fff",
                    opacity: voiceLocked ? 0.6 : 1,
                    background: voiceLocked
                      ? "var(--text-muted)"
                      : listening
                        ? "var(--danger)"
                        : "var(--accent)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    className="material-icons-round"
                    style={{ fontSize: 18 }}
                  >
                    {voiceLocked ? "mic_off" : listening ? "mic" : "mic_none"}
                  </span>
                  {voiceLocked
                    ? `Paused ${lockSecs}s`
                    : listening
                      ? "Stop Voice"
                      : "Voice Fill"}
                  {listening && !voiceLocked && <span className="rec-dot" />}
                </button>
                <div
                  style={{
                    flex: 1,
                    minWidth: 180,
                    fontSize: "0.8rem",
                    color: statusColor,
                    fontWeight:
                      voiceLocked || voiceAlert || voiceText.startsWith("✓")
                        ? 700
                        : 400,
                  }}
                >
                  {statusText}
                </div>
              </div>
            );
          })()}

        {/* Section tabs — locked until the previous section is fully answered */}
        <div className="tabs" style={{ marginBottom: 16 }}>
          {(() => {
            const isComplete = (i) =>
              sections[i].questions.every((_, qi) => getAnswer(i, qi) !== "");
            // furthest section the student may open (first incomplete one)
            let frontier = 0;
            while (frontier < sections.length - 1 && isComplete(frontier))
              frontier++;
            return sections.map((sec, i) => {
              const secAnswered = sec.questions.filter(
                (_, qi) => getAnswer(i, qi) !== "",
              ).length;
              const locked = i > frontier;
              return (
                <button
                  key={i}
                  className={`tab ${sectionIdx === i ? "active" : ""}`}
                  onClick={() => !locked && setSectionIdx(i)}
                  disabled={locked}
                  title={
                    locked ? "Finish the current section to unlock this" : ""
                  }
                  style={
                    locked
                      ? { opacity: 0.45, cursor: "not-allowed" }
                      : undefined
                  }
                >
                  <span style={{ fontSize: "0.75rem" }}>{sec.name}</span>
                  <span
                    style={{ fontSize: "0.65rem", opacity: 0.7, marginLeft: 4 }}
                  >
                    {secAnswered}/{sec.questions.length}
                  </span>
                  {locked && (
                    <span
                      className="material-icons-round"
                      style={{ fontSize: 12, marginLeft: 3, opacity: 0.8 }}
                    >
                      lock
                    </span>
                  )}
                </button>
              );
            });
          })()}
        </div>

        {/* Questions grid with speaker icon */}
        <div className="exam-questions-grid">
          {currentSection?.questions.map((q, qIdx) => {
            const chain = q.chain || [];
            const answered = getAnswer(sectionIdx, qIdx) !== "";
            const qKey = `${sectionIdx}-${qIdx}`;
            return (
              <div
                key={qIdx}
                className={`exam-question-card ${answered ? "answered" : ""}`}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <div className="exam-q-number">Q{qIdx + 1}</div>
                  <button
                    className={`exam-speak-btn ${speakingQ === qKey ? "speaking" : ""}`}
                    onClick={() => handleSpeak(chain, qKey)}
                    title="Read aloud"
                  >
                    <span
                      className="material-icons-round"
                      style={{ fontSize: 18 }}
                    >
                      volume_up
                    </span>
                  </button>
                </div>
                <div className="exam-chain horizontal">
                  {chain.map((n, ni) => (
                    <span
                      key={ni}
                      className={`chain-num ${n < 0 ? "negative" : "positive"}`}
                    >
                      {n >= 0 && ni > 0 ? "+" : ""}
                      {n}
                    </span>
                  ))}
                </div>
                <input
                  ref={(el) => (inputRefs.current[qKey] = el)}
                  type="text"
                  className="exam-answer-input"
                  placeholder="Say answer"
                  value={getAnswer(sectionIdx, qIdx)}
                  readOnly
                  title="Answers can only be filled by voice"
                  style={{ cursor: "default" }}
                />
              </div>
            );
          })}
        </div>

        {/* Submit */}
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            marginTop: 24,
            marginBottom: 24,
          }}
        >
          <button className="btn btn-primary btn-lg" onClick={finishExam}>
            <span
              className="material-icons-round"
              style={{ fontSize: 18, verticalAlign: "middle", marginRight: 4 }}
            >
              check_circle
            </span>
            Submit Exam ({answeredCount}/{totalQCount})
          </button>
          <button
            className="btn btn-ghost btn-lg"
            style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
            onClick={() => {
              setAbandonReason("");
              setAbandonErr("");
              setShowAbandon(true);
            }}
          >
            <span
              className="material-icons-round"
              style={{ fontSize: 18, verticalAlign: "middle", marginRight: 4 }}
            >
              cancel
            </span>
            Cancel Exam
          </button>
        </div>

        {/* Voice penalty lockout popup */}
        {voiceLocked && (
          <div className="modal-overlay">
            <div
              className="modal-box"
              style={{ maxWidth: 420, textAlign: "center" }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(231,76,60,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 14px",
                }}
              >
                <span
                  className="material-icons-round"
                  style={{ fontSize: 34, color: "var(--danger)" }}
                >
                  mic_off
                </span>
              </div>
              <div className="modal-title" style={{ marginBottom: 8 }}>
                Voice paused
              </div>
              <p
                style={{
                  fontSize: "0.88rem",
                  color: "rgba(255,255,255,0.75)",
                  lineHeight: 1.5,
                  marginBottom: 18,
                }}
              >
                We detected 8 off-topic phrases in a row. To keep the exam fair,
                voice input is paused for a few seconds. Please speak{" "}
                <strong style={{ color: "#fff" }}>only answers</strong>, like
                "Q1 25" or "Q3 pass".
              </p>
              <div
                style={{
                  fontSize: "2.6rem",
                  fontWeight: 800,
                  color: "var(--danger)",
                  lineHeight: 1,
                }}
              >
                {lockSecs}s
              </div>
              <div
                style={{
                  fontSize: "0.78rem",
                  color: "rgba(255,255,255,0.5)",
                  marginTop: 6,
                }}
              >
                The timer keeps running — resuming automatically…
              </div>
            </div>
          </div>
        )}

        {/* Abandon / cancel exam modal */}
        {showAbandon && (
          <div
            className="modal-overlay"
            onClick={() => !submittingAbandon && setShowAbandon(false)}
          >
            <div
              className="modal-box"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 460 }}
            >
              <div className="modal-title">
                <span
                  className="material-icons-round"
                  style={{
                    fontSize: 20,
                    verticalAlign: "middle",
                    marginRight: 4,
                    color: "var(--danger)",
                  }}
                >
                  report_problem
                </span>
                Cancel Exam
              </div>
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                Please give a valid reason for cancelling. Your request will be
                sent to your teacher for approval. You will not be able to
                continue this exam.
              </p>
              <textarea
                autoFocus
                value={abandonReason}
                onChange={(e) => {
                  setAbandonReason(e.target.value);
                  if (abandonErr) setAbandonErr("");
                }}
                placeholder="e.g. Feeling unwell, internet issue, disturbance…"
                rows={4}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: `1px solid ${abandonErr ? "var(--danger)" : "rgba(255,255,255,0.18)"}`,
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  padding: "10px 12px",
                  fontSize: "0.88rem",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              {abandonErr && (
                <div
                  style={{
                    color: "var(--danger)",
                    fontSize: "0.78rem",
                    marginTop: 6,
                  }}
                >
                  {abandonErr}
                </div>
              )}
              <div
                style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}
              >
                <button
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    background: "var(--danger)",
                    borderColor: "var(--danger)",
                  }}
                  disabled={submittingAbandon}
                  onClick={submitAbandon}
                >
                  {submittingAbandon ? "Sending…" : "Submit Request"}
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
                  disabled={submittingAbandon}
                  onClick={() => setShowAbandon(false)}
                >
                  Keep Going
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── RESULTS ───────────────────────────────────────────────
  let totalCorrect = 0,
    totalMarks = 0,
    maxMarks = 0;
  const sectionResults = sections.map((section, sIdx) => {
    const marksEach = section.marksEach || 1;
    let correct = 0;
    const details = section.questions.map((q, qIdx) => {
      const userAns = parseInt(getAnswer(sIdx, qIdx), 10);
      const correctAns = q.answer != null ? q.answer : solveChain(q.chain);
      const isCorrect = userAns === correctAns;
      if (isCorrect) {
        correct++;
        totalCorrect++;
      }
      maxMarks += marksEach;
      if (isCorrect) totalMarks += marksEach;
      return { chain: q.chain, userAns, correctAns, isCorrect };
    });
    return {
      ...section,
      correct,
      total: section.questions.length,
      marks: correct * marksEach,
      maxMarks: section.questions.length * marksEach,
      details,
    };
  });

  const pct = maxMarks > 0 ? Math.round((totalMarks / maxMarks) * 100) : 0;
  const grade = getGrade(pct);
  const timeUsed = (exam.totalTime || 1200) - timeLeft;

  return (
    <div className="page-content">
      {/* Video playback modal */}
      {showPlayback && playbackUrl && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowPlayback(false);
            URL.revokeObjectURL(playbackUrl);
          }}
        >
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 500 }}
          >
            <div className="modal-title">
              <span
                className="material-icons-round"
                style={{
                  fontSize: 20,
                  verticalAlign: "middle",
                  marginRight: 4,
                }}
              >
                videocam
              </span>
              Exam Recording — {user.name}
            </div>
            <video
              src={playbackUrl}
              controls
              autoPlay
              style={{ width: "100%", borderRadius: 8, marginTop: 12 }}
            />
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                setShowPlayback(false);
                URL.revokeObjectURL(playbackUrl);
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="results-card">
        <div style={{ fontSize: "3rem", marginBottom: 8 }}>
          <span
            className="material-icons-round"
            style={{ fontSize: "inherit" }}
          >
            emoji_events
          </span>
        </div>

        {/* Student name in results */}
        <div
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            marginBottom: 8,
          }}
        >
          <span
            className="material-icons-round"
            style={{ fontSize: 14, verticalAlign: "middle" }}
          >
            person
          </span>{" "}
          {user.name}
        </div>

        <div className={`results-score ${grade.cls}`}>
          {totalMarks}/{maxMarks}
        </div>
        <div className="results-label">{grade.label}</div>
        <div className="results-sub">
          {pct}% • Grade: {grade.letter} • Time: {formatTime(timeUsed)}
        </div>

        {/* Recording thumbnail — click to play */}
        {recordingKey ? (
          <div
            className="recording-thumbnail"
            onClick={() => handleViewRecording(recordingKey)}
          >
            <span className="material-icons-round" style={{ fontSize: 28 }}>
              play_circle
            </span>
            <span style={{ fontSize: "0.78rem" }}>
              View Exam Recording (saved ✓)
            </span>
          </div>
        ) : (
          <div
            style={{
              marginTop: 12,
              fontSize: "0.78rem",
              color: "var(--gold)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              justifyContent: "center",
            }}
          >
            <span className="material-icons-round" style={{ fontSize: 16 }}>
              videocam_off
            </span>
            Exam recording was not captured (camera may have been blocked or
            stopped).
          </div>
        )}

        {/* Section breakdown — collapsible */}
        <div style={{ width: "100%", marginTop: 24, marginBottom: 20 }}>
          {sectionResults.map((sec, i) => {
            const isOpen = openSections[i];
            return (
              <div key={i} style={{ marginBottom: 12 }}>
                <div
                  onClick={() =>
                    setOpenSections((prev) => ({ ...prev, [i]: !prev[i] }))
                  }
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    cursor: "pointer",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.06)",
                    userSelect: "none",
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      className="material-icons-round"
                      style={{
                        fontSize: 18,
                        transition: "transform 0.2s",
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                      }}
                    >
                      chevron_right
                    </span>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                      {sec.name}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "rgba(255,255,255,0.4)",
                        marginLeft: 4,
                      }}
                    >
                      ({sec.correct}/{sec.total} correct)
                    </span>
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        sec.correct === sec.total
                          ? "#2ecc71"
                          : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {sec.marks}/{sec.maxMarks} marks
                  </span>
                </div>
                {isOpen && (
                  <table
                    className="exam-results-table"
                    style={{ marginTop: 4 }}
                  >
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Question</th>
                        <th>Answer</th>
                        <th>Your Ans</th>
                        <th className="q-status"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.details.map((d, j) => (
                        <tr
                          key={j}
                          className={d.isCorrect ? "correct" : "wrong"}
                        >
                          <td className="q-label">Q{j + 1}</td>
                          <td className="q-chain">
                            {d.chain.map((n, ni) => (
                              <span key={ni} className={n < 0 ? "neg" : ""}>
                                {ni > 0 && n >= 0 ? " +" : ni > 0 ? " " : ""}
                                {n}
                              </span>
                            ))}
                          </td>
                          <td className="q-answer">= {d.correctAns}</td>
                          <td
                            className={`q-user ${d.isCorrect ? "is-correct" : "is-wrong"}`}
                          >
                            {isNaN(d.userAns) ? "—" : d.userAns}
                          </td>
                          <td className="q-status">
                            <span
                              className="material-icons-round"
                              style={{
                                fontSize: 16,
                                color: d.isCorrect ? "#2ecc71" : "#ff6b6b",
                              }}
                            >
                              {d.isCorrect ? "check_circle" : "cancel"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <button
            className="btn btn-primary"
            onClick={() => navigate("student-dashboard")}
          >
            ← Dashboard
          </button>
          <button
            className="btn btn-ghost"
            style={{ color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
            onClick={() => {
              const w = window.open("", "_blank");
              if (!w) return;
              w.document
                .write(`<!DOCTYPE html><html><head><title>${exam.title} - Results</title><style>
              body{font-family:Arial,sans-serif;padding:24px;color:#222;max-width:800px;margin:0 auto}
              h1{font-size:20px;margin-bottom:2px} .meta{font-size:13px;color:#666;margin-bottom:6px}
              .summary{display:flex;gap:24px;margin-bottom:20px;padding:12px 0;border-bottom:2px solid #eee}
              .summary div{text-align:center} .summary .val{font-size:28px;font-weight:900} .summary .lbl{font-size:11px;color:#888;text-transform:uppercase}
              .sec{margin-bottom:18px} .sec-title{display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #ddd}
              table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:4px}
              th{background:#f5f5f5;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px;padding:6px 8px;text-align:left;border-bottom:1px solid #ddd}
              td{padding:5px 8px;border-bottom:1px solid #f0f0f0;font-family:monospace}
              tr.correct{background:#f0faf4} tr.wrong{background:#fef5f5}
              .neg{color:#d32f2f} .ans{font-weight:700;color:#2e7d32} .user-correct{color:#2e7d32;font-weight:600} .user-wrong{color:#d32f2f;font-weight:600}
              .icon{font-size:14px;vertical-align:middle}
              @media print{body{padding:12px}.no-print{display:none!important}}
            </style></head><body>
            <h1>${exam.title} — Results</h1>
            <div class="meta">${user.name} &bull; ${new Date().toLocaleDateString()}</div>
            <div class="summary">
              <div><div class="val">${totalMarks}/${maxMarks}</div><div class="lbl">Score</div></div>
              <div><div class="val">${pct}%</div><div class="lbl">Percentage</div></div>
              <div><div class="val">${grade.letter}</div><div class="lbl">Grade</div></div>
              <div><div class="val">${formatTime(timeUsed)}</div><div class="lbl">Time</div></div>
            </div>
            ${sectionResults
              .map(
                (sec) => `<div class="sec">
              <div class="sec-title"><span>${sec.name}</span><span>${sec.marks}/${sec.maxMarks} marks</span></div>
              <table><thead><tr><th>#</th><th>Question</th><th>Answer</th><th>Your Ans</th><th></th></tr></thead><tbody>
              ${sec.details
                .map(
                  (d, j) => `<tr class="${d.isCorrect ? "correct" : "wrong"}">
                <td style="font-weight:600;color:#888;font-family:Arial">Q${j + 1}</td>
                <td>${d.chain.map((n, ni) => `<span class="${n < 0 ? "neg" : ""}">${ni > 0 && n >= 0 ? " +" : ni > 0 ? " " : ""}${n}</span>`).join("")}</td>
                <td class="ans">= ${d.correctAns}</td>
                <td class="${d.isCorrect ? "user-correct" : "user-wrong"}">${isNaN(d.userAns) ? "—" : d.userAns}</td>
                <td>${d.isCorrect ? "✓" : "✗"}</td>
              </tr>`,
                )
                .join("")}
              </tbody></table></div>`,
              )
              .join("")}
            <br/><button class="no-print" onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#e65100;color:#fff;border:none;border-radius:6px">Print / Save as PDF</button>
            </body></html>`);
              w.document.close();
            }}
          >
            <span
              className="material-icons-round"
              style={{ fontSize: 16, verticalAlign: "middle", marginRight: 4 }}
            >
              picture_as_pdf
            </span>
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
