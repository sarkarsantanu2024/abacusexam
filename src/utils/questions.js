// ─── DIFFICULTY LEVELS (AbacusExam Curriculum) ──────────────
export const LEVELS = {
  basic: {
    name: "Basic",
    icon: "spa",
    order: 1,
    desc: "Single digit add/subtract chains",
  },
  kids1: {
    name: "Kids 1",
    icon: "child_care",
    order: 2,
    desc: "Small numbers, short chains",
  },
  kids2: {
    name: "Kids 2",
    icon: "child_care",
    order: 3,
    desc: "Bigger numbers, longer chains",
  },
  kids3: {
    name: "Kids 3",
    icon: "child_care",
    order: 4,
    desc: "Two-digit chains with carry",
  },
  level1: {
    name: "Level 1",
    icon: "looks_one",
    order: 5,
    desc: "Small Friend concept",
  },
  level2: {
    name: "Level 2",
    icon: "looks_two",
    order: 6,
    desc: "Big Friend concept",
  },
  level3: { name: "Level 3", icon: "looks_3", order: 7, desc: "Mix Friend" },
  level4: {
    name: "Level 4",
    icon: "looks_4",
    order: 8,
    desc: "Two-digit advanced",
  },
  level5: {
    name: "Level 5",
    icon: "looks_5",
    order: 9,
    desc: "Three-digit operations",
  },
  level6: {
    name: "Level 6",
    icon: "looks_6",
    order: 10,
    desc: "Multiplication basics",
  },
  level7: { name: "Level 7", icon: "star", order: 11, desc: "Division basics" },
  level8: {
    name: "Level 8",
    icon: "military_tech",
    order: 12,
    desc: "Advanced all operations",
  },
};

export const LEVEL_KEYS = Object.keys(LEVELS);

// ─── CHAIN QUESTION HELPERS ─────────────────────────────────
// A "chain" question is a sequence of numbers to add/subtract in order
// e.g. [23, 5, -1, -5] → student calculates: 23 + 5 - 1 - 5 = 22

export function solveChain(chain) {
  return chain.reduce((sum, n) => sum + n, 0);
}

export function formatChain(chain) {
  return chain
    .map((n, i) => {
      if (i === 0) return String(n);
      return n >= 0 ? `+${n}` : String(n);
    })
    .join("\n");
}

export function formatChainInline(chain) {
  return chain
    .map((n, i) => {
      if (i === 0) return String(n);
      return n >= 0 ? ` + ${n}` : ` − ${Math.abs(n)}`;
    })
    .join("");
}

// ─── PARSE QUESTIONS FROM PDF TEXT ──────────────────────────
// PDF text from abacus exam papers has sections:
// "Do with Abacus", "Do with Finger", "Do with Mentally"
// Each section has columns of numbers forming chain questions

export function parseAbacusQuestions(rawText) {
  const sections = {
    abacus: { name: "Do with Abacus", marks: "1 x 20 = 20", questions: [] },
    finger: { name: "Do with Finger", marks: "1 x 20 = 20", questions: [] },
    mental: { name: "Do with Mentally", marks: "1.5 x 20 = 30", questions: [] },
  };

  // Clean up and split into lines
  const lines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Extract all numbers from the text, group into chains
  // Strategy: numbers separated by non-numeric content form chain boundaries
  const allNumbers = [];
  let currentSection = "abacus";

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Detect section headers
    if (lower.includes("do with finger") || lower.includes("finger")) {
      if (allNumbers.length > 0 && sections.abacus.questions.length === 0) {
        sections.abacus.questions = groupIntoChains(allNumbers, 20);
        allNumbers.length = 0;
      }
      currentSection = "finger";
      continue;
    }
    if (lower.includes("do with mental") || lower.includes("mentally")) {
      if (
        allNumbers.length > 0 &&
        sections[currentSection === "finger" ? "finger" : "abacus"].questions
          .length === 0
      ) {
        sections[currentSection === "finger" ? "finger" : "abacus"].questions =
          groupIntoChains(allNumbers, 20);
        allNumbers.length = 0;
      }
      currentSection = "mental";
      continue;
    }
    if (lower.includes("do with abacus")) {
      currentSection = "abacus";
      continue;
    }

    // Skip non-question lines
    if (
      lower.includes("monthly") ||
      lower.includes("name") ||
      lower.includes("centre") ||
      lower.includes("time") ||
      lower.includes("f.m") ||
      lower.includes("speed") ||
      lower.includes("genius") ||
      lower.includes("mark") ||
      lower.includes("hand") ||
      lower.includes("letter") ||
      lower.includes("calculator") ||
      lower.includes("irregular") ||
      lower.includes("regular") ||
      lower.includes("how many") ||
      lower.includes("pages") ||
      lower.includes("triangles") ||
      lower.includes("squares") ||
      lower.includes("value")
    ) {
      continue;
    }

    // Extract numbers (including negative)
    const nums = line.match(/-?\d+/g);
    if (nums) {
      for (const n of nums) {
        allNumbers.push(parseInt(n, 10));
      }
    }
  }

  // Assign remaining numbers to current section
  if (allNumbers.length > 0) {
    const target = currentSection;
    if (sections[target].questions.length === 0) {
      sections[target].questions = groupIntoChains(allNumbers, 20);
    }
  }

  // If we couldn't separate sections, put all questions together
  const totalQs =
    sections.abacus.questions.length +
    sections.finger.questions.length +
    sections.mental.questions.length;
  if (totalQs === 0) {
    // Fallback: treat entire text as chain questions
    const allNums = [];
    for (const line of lines) {
      const nums = line.match(/-?\d+/g);
      if (nums) nums.forEach((n) => allNums.push(parseInt(n, 10)));
    }
    if (allNums.length > 0) {
      const chains = groupIntoChains(allNums, 20);
      // Split evenly across 3 sections
      const perSection = Math.ceil(chains.length / 3);
      sections.abacus.questions = chains.slice(0, perSection);
      sections.finger.questions = chains.slice(perSection, perSection * 2);
      sections.mental.questions = chains.slice(perSection * 2);
    }
  }

  return sections;
}

// Group a flat array of numbers into chains of ~chainLength numbers each
// Heuristic: a new chain starts when we see a positive number after a sequence.
// MAX_CHAIN_LEN hard-caps any single chain so a parse can never produce a
// runaway question with hundreds of terms (e.g. the last chain absorbing all
// leftover numbers). 12 is comfortably above a normal abacus chain (3–8).
const MAX_CHAIN_LEN = 12;

function groupIntoChains(numbers, targetCount = 20, maxChainLen = MAX_CHAIN_LEN) {
  if (numbers.length === 0) return [];

  const chains = [];
  let current = [];

  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i];

    if (current.length === 0) {
      current.push(n);
      continue;
    }

    // Force a split when the chain hits the length cap, OR when the heuristic
    // sees a likely "start" number after at least 3 terms. The cap fires
    // regardless of how many chains we already have, so no chain runs away.
    const heuristicBreak =
      current.length >= 3 &&
      n > 0 &&
      (i === numbers.length - 1 || numbers[i] > 5);
    const capBreak = current.length >= maxChainLen;

    if (capBreak || heuristicBreak) {
      chains.push([...current]);
      current = [n];
    } else {
      current.push(n);
    }
  }

  if (current.length > 0) {
    chains.push(current);
  }

  // If we got too few chains, try splitting more aggressively (still capped).
  if (chains.length < targetCount && chains.length > 0) {
    const avgLen = Math.round(numbers.length / targetCount);
    if (avgLen >= 3) {
      const chunkLen = Math.min(avgLen, maxChainLen);
      const rechained = [];
      for (let i = 0; i < numbers.length; i += chunkLen) {
        const chunk = numbers.slice(i, i + chunkLen);
        // Make sure first number is positive (absolute value)
        if (chunk.length > 0 && chunk[0] < 0) chunk[0] = Math.abs(chunk[0]);
        rechained.push(chunk);
      }
      return rechained.slice(0, targetCount);
    }
  }

  // Cap to targetCount — excess numbers are dropped rather than dumped into the
  // final chain — and ensure every chain starts with a positive number.
  return chains.slice(0, targetCount).map((c) =>
    c.length && c[0] < 0 ? [Math.abs(c[0]), ...c.slice(1)] : c,
  );
}

// ─── GENERATE PRACTICE CHAIN QUESTIONS ──────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const LEVEL_CONFIGS = {
  basic: { startRange: [1, 9], addRange: [1, 8], chainLen: [3, 5] },
  kids1: { startRange: [1, 9], addRange: [1, 5], chainLen: [3, 4] },
  kids2: { startRange: [5, 20], addRange: [1, 9], chainLen: [4, 5] },
  kids3: { startRange: [10, 50], addRange: [1, 15], chainLen: [4, 6] },
  level1: { startRange: [10, 50], addRange: [1, 20], chainLen: [4, 6] },
  level2: { startRange: [20, 99], addRange: [1, 30], chainLen: [5, 7] },
  level3: { startRange: [20, 99], addRange: [1, 50], chainLen: [5, 7] },
  level4: { startRange: [10, 99], addRange: [1, 99], chainLen: [5, 8] },
  level5: { startRange: [100, 999], addRange: [1, 200], chainLen: [4, 6] },
  level6: { startRange: [100, 999], addRange: [1, 500], chainLen: [4, 6] },
  level7: { startRange: [100, 9999], addRange: [1, 999], chainLen: [4, 6] },
  level8: { startRange: [1000, 9999], addRange: [1, 2000], chainLen: [5, 8] },
};

export function generateChainQuestion(levelKey = "basic") {
  const cfg = LEVEL_CONFIGS[levelKey] || LEVEL_CONFIGS.basic;
  const chainLen = rand(cfg.chainLen[0], cfg.chainLen[1]);
  const chain = [];

  // First number is always positive
  let running = rand(cfg.startRange[0], cfg.startRange[1]);
  chain.push(running);

  for (let i = 1; i < chainLen; i++) {
    const val = rand(1, cfg.addRange[1]);
    // Decide add or subtract, ensuring result stays non-negative
    if (running > val && Math.random() < 0.5) {
      chain.push(-val);
      running -= val;
    } else {
      chain.push(val);
      running += val;
    }
  }

  return { chain, answer: solveChain(chain) };
}

export function generatePracticeSet(count = 20, levelKey = "basic") {
  return Array.from({ length: count }, () => generateChainQuestion(levelKey));
}

// Defensive cap for exams already saved with runaway chains (from the old
// parser). Truncates any over-long chain and recomputes its answer so a stored
// 100-term question renders as a sane one. Safe to call on any exam.
export function capExamChains(exam, maxLen = MAX_CHAIN_LEN) {
  if (!exam?.sections) return exam;
  let changed = false;
  const sections = exam.sections.map((sec) => ({
    ...sec,
    questions: (sec.questions || []).map((q) => {
      const chain = q.chain || [];
      if (chain.length <= maxLen) return q;
      changed = true;
      const capped = chain.slice(0, maxLen);
      return { ...q, chain: capped, answer: solveChain(capped) };
    }),
  }));
  return changed ? { ...exam, sections } : exam;
}

// ─── EXAM STRUCTURE ─────────────────────────────────────────
// Full exam: 3 sections, 20 questions each, 20 minutes, 80 marks total
export function generateExam(levelKey = "basic") {
  return {
    level: levelKey,
    levelName: LEVELS[levelKey]?.name || levelKey,
    totalTime: 20 * 60, // 20 minutes in seconds
    fullMarks: 80,
    sections: [
      {
        name: "Do with Abacus",
        marksEach: 1,
        questions: generatePracticeSet(20, levelKey),
      },
      {
        name: "Do with Finger",
        marksEach: 1,
        questions: generatePracticeSet(20, levelKey),
      },
      {
        name: "Do with Mentally",
        marksEach: 1.5,
        questions: generatePracticeSet(20, levelKey),
      },
    ],
  };
}

// ─── XP & GRADE ─────────────────────────────────────────────
export function calcXP(correct, total, levelKey, bonus = 0) {
  const order = LEVELS[levelKey]?.order || 1;
  const base = correct * 10 * order;
  const perfBonus = correct === total ? 50 : 0;
  return base + perfBonus + bonus;
}

export function getGrade(pct) {
  if (pct >= 90) return { letter: "A+", label: "Excellent!", cls: "great" };
  if (pct >= 80) return { letter: "A", label: "Great work!", cls: "great" };
  if (pct >= 70) return { letter: "B", label: "Good job!", cls: "ok" };
  if (pct >= 50) return { letter: "C", label: "Keep practicing!", cls: "ok" };
  return { letter: "D", label: "More practice needed", cls: "poor" };
}

// ─── SHARE CODE ENCODING/DECODING ───────────────────────────
// Encode exam data to a compact shareable string
export function encodeShareCode(examData) {
  try {
    const json = JSON.stringify(examData);
    return btoa(unescape(encodeURIComponent(json)));
  } catch {
    return null;
  }
}

export function decodeShareCode(code) {
  try {
    const json = decodeURIComponent(escape(atob(code.trim())));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
