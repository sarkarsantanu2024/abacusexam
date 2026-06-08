import React, { createContext, useContext, useState, useEffect } from "react";

// ─── STORAGE HELPERS ──────────────────────────────────────────
const KEYS = {
  USERS: "sor_users",
  CURRENT_USER: "sor_current_user",
  SCORES: "sor_scores",
  DAILY: "sor_daily",
  QUESTION_SETS: "sor_qsets",
  EXAMS: "sor_exams",
  EXAM_RESULTS: "sor_exam_results",
  EXAM_REQUESTS: "sor_exam_requests",
  API_KEY: "sor_apikey",
};

const DEFAULT_USERS = [
  {
    id: "teacher_demo",
    username: "teacher",
    password: "teacher123",
    role: "teacher",
    name: "Demo Teacher",
    franchiseCode: "ABACUS01",
    school: "Your School Name",
  },
  {
    id: "student_demo",
    username: "student",
    password: "student123",
    role: "student",
    name: "Demo Student",
    teacherId: "teacher_demo",
    level: 2,
    xp: 450,
  },
  {
    id: "student_demo2",
    username: "arjun",
    password: "arjun123",
    role: "student",
    name: "Arjun Sharma",
    teacherId: "teacher_demo",
    level: 3,
    xp: 1200,
  },
];

export const storage = {
  getUsers: () => {
    const data = localStorage.getItem(KEYS.USERS);
    return data ? JSON.parse(data) : DEFAULT_USERS;
  },
  saveUsers: (users) => localStorage.setItem(KEYS.USERS, JSON.stringify(users)),

  getCurrentUser: () => {
    const data = localStorage.getItem(KEYS.CURRENT_USER);
    return data ? JSON.parse(data) : null;
  },
  setCurrentUser: (user) =>
    localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user)),
  clearCurrentUser: () => localStorage.removeItem(KEYS.CURRENT_USER),

  getScores: (userId) => {
    const data = localStorage.getItem(KEYS.SCORES);
    const all = data ? JSON.parse(data) : {};
    return all[userId] || [];
  },
  addScore: (userId, score) => {
    const data = localStorage.getItem(KEYS.SCORES);
    const all = data ? JSON.parse(data) : {};
    if (!all[userId]) all[userId] = [];
    all[userId].unshift({ ...score, date: new Date().toISOString() });
    if (all[userId].length > 100) all[userId] = all[userId].slice(0, 100);
    localStorage.setItem(KEYS.SCORES, JSON.stringify(all));
  },
  getAllScores: () => {
    const data = localStorage.getItem(KEYS.SCORES);
    return data ? JSON.parse(data) : {};
  },

  getDailyProgress: (userId) => {
    const data = localStorage.getItem(KEYS.DAILY);
    const all = data ? JSON.parse(data) : {};
    return all[userId] || {};
  },
  setDailyProgress: (userId, progress) => {
    const data = localStorage.getItem(KEYS.DAILY);
    const all = data ? JSON.parse(data) : {};
    all[userId] = { ...progress, date: new Date().toDateString() };
    localStorage.setItem(KEYS.DAILY, JSON.stringify(all));
  },

  getApiKey: () => localStorage.getItem(KEYS.API_KEY) || "",
  setApiKey: (key) => localStorage.setItem(KEYS.API_KEY, key),

  getQuestionSets: () => {
    const data = localStorage.getItem(KEYS.QUESTION_SETS);
    return data ? JSON.parse(data) : [];
  },
  saveQuestionSet: (qset) => {
    const sets = storage.getQuestionSets();
    sets.unshift({
      ...qset,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(KEYS.QUESTION_SETS, JSON.stringify(sets));
  },

  // ── EXAM PAPERS (uploaded by teacher) ──
  getExams: () => {
    const data = localStorage.getItem(KEYS.EXAMS);
    return data ? JSON.parse(data) : [];
  },
  saveExam: (exam) => {
    const exams = storage.getExams();
    exams.unshift({
      ...exam,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(KEYS.EXAMS, JSON.stringify(exams));
    return exams[0];
  },
  deleteExam: (id) => {
    const exams = storage.getExams().filter((e) => e.id !== id);
    localStorage.setItem(KEYS.EXAMS, JSON.stringify(exams));
  },
  importExam: (examData) => {
    const exams = storage.getExams();
    // Avoid duplicates
    if (!exams.find((e) => e.id === examData.id)) {
      exams.unshift(examData);
      localStorage.setItem(KEYS.EXAMS, JSON.stringify(exams));
    }
    return examData;
  },

  // ── EXAM RESULTS ──
  getExamResults: (userId) => {
    const data = localStorage.getItem(KEYS.EXAM_RESULTS);
    const all = data ? JSON.parse(data) : {};
    return all[userId] || [];
  },
  addExamResult: (userId, result) => {
    const data = localStorage.getItem(KEYS.EXAM_RESULTS);
    const all = data ? JSON.parse(data) : {};
    if (!all[userId]) all[userId] = [];
    all[userId].unshift({ ...result, date: new Date().toISOString() });
    localStorage.setItem(KEYS.EXAM_RESULTS, JSON.stringify(all));
  },
  getAllExamResults: () => {
    const data = localStorage.getItem(KEYS.EXAM_RESULTS);
    return data ? JSON.parse(data) : {};
  },

  // ── EXAM ABANDON / CANCEL REQUESTS (student → teacher approval) ──
  getExamRequests: () => {
    const data = localStorage.getItem(KEYS.EXAM_REQUESTS);
    return data ? JSON.parse(data) : [];
  },
  addExamRequest: (req) => {
    const all = storage.getExamRequests();
    const created = {
      ...req,
      id: "req_" + Date.now(),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    all.unshift(created);
    localStorage.setItem(KEYS.EXAM_REQUESTS, JSON.stringify(all));
    return created;
  },
  updateExamRequest: (id, updates) => {
    const all = storage.getExamRequests();
    const idx = all.findIndex((r) => r.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...updates };
      localStorage.setItem(KEYS.EXAM_REQUESTS, JSON.stringify(all));
    }
  },

  // Remove one student and all their data (scores, exam results, requests).
  deleteStudent: (studentId) => {
    const users = storage.getUsers().filter((u) => u.id !== studentId);
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));

    const scores = storage.getAllScores();
    delete scores[studentId];
    localStorage.setItem(KEYS.SCORES, JSON.stringify(scores));

    const results = storage.getAllExamResults();
    delete results[studentId];
    localStorage.setItem(KEYS.EXAM_RESULTS, JSON.stringify(results));

    const reqs = storage
      .getExamRequests()
      .filter((r) => r.studentId !== studentId);
    localStorage.setItem(KEYS.EXAM_REQUESTS, JSON.stringify(reqs));
  },

  // ── FULL RESET ──
  // Wipe every app key. Crucially, set USERS to an empty array (not just
  // remove it) so the hardcoded demo accounts do NOT get re-seeded on reload.
  clearAllData: () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem("sor_linked_teacher_code");
    localStorage.setItem(KEYS.USERS, "[]");
  },

  // ── EXPORT / IMPORT ──
  exportAll: () => {
    const out = {};
    Object.values(KEYS).forEach((k) => {
      const v = localStorage.getItem(k);
      out[k] = v ? JSON.parse(v) : null;
    });
    return out;
  },
  importAll: (obj) => {
    Object.entries(obj).forEach(([k, v]) => {
      try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {
        // ignore invalid entries
      }
    });
  },
};

// ─── AUTH CONTEXT ─────────────────────────────────────────────
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("login");
  const [pageProps, setPageProps] = useState({});

  useEffect(() => {
    const saved = storage.getCurrentUser();
    if (saved) {
      setUser(saved);
      setPage(
        saved.role === "teacher" ? "teacher-dashboard" : "student-dashboard",
      );
    }
  }, []);

  const login = (username, password) => {
    const users = storage.getUsers();
    const found = users.find(
      (u) =>
        u.username.toLowerCase() === username.toLowerCase() &&
        u.password === password,
    );
    if (!found) return false;
    storage.setCurrentUser(found);
    setUser(found);
    setPage(
      found.role === "teacher" ? "teacher-dashboard" : "student-dashboard",
    );
    return true;
  };

  const register = (data) => {
    const users = storage.getUsers();
    if (
      users.find(
        (u) => u.username.toLowerCase() === data.username.toLowerCase(),
      )
    ) {
      return { ok: false, error: "Username already taken" };
    }
    if (data.role === "teacher") {
      const franchiseCode =
        data.username.toUpperCase().slice(0, 6) +
        Math.floor(100 + Math.random() * 900);
      const newUser = {
        id: "teacher_" + Date.now(),
        username: data.username,
        password: data.password,
        name: data.name,
        role: "teacher",
        school: data.school || "My Abacus School",
        franchiseCode: franchiseCode,
      };
      storage.saveUsers([...users, newUser]);
      storage.setCurrentUser(newUser);
      setUser(newUser);
      setPage("teacher-dashboard");
      return { ok: true, franchiseCode: franchiseCode };
    } else {
      // student: find teacher by franchise code (optional — fallback to first teacher)
      let teacher = data.franchiseCode
        ? users.find(
            (u) =>
              u.franchiseCode === data.franchiseCode && u.role === "teacher",
          )
        : null;
      if (!teacher) teacher = users.find((u) => u.role === "teacher");
      if (!teacher)
        return { ok: false, error: "No teacher found. Please contact admin." };
      const newUser = {
        id: "student_" + Date.now(),
        username: data.username,
        password: data.password,
        name: data.name,
        role: "student",
        teacherId: teacher.id,
        level: 1,
        xp: 0,
      };
      storage.saveUsers([...users, newUser]);
      storage.setCurrentUser(newUser);
      setUser(newUser);
      setPage("student-dashboard");
      return { ok: true };
    }
  };

  const logout = () => {
    storage.clearCurrentUser();
    setUser(null);
    setPage("login");
    setPageProps({});
  };

  const navigate = (p, props = {}) => {
    setPage(p);
    setPageProps(props);
  };

  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    const users = storage.getUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx !== -1) {
      users[idx] = updated;
      storage.saveUsers(users);
    }
    storage.setCurrentUser(updated);
    setUser(updated);
  };

  return (
    <AuthCtx.Provider
      value={{
        user,
        page,
        pageProps,
        login,
        register,
        logout,
        navigate,
        updateUser,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
