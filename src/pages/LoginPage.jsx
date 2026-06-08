import React, { useState, useEffect } from "react";
import { useAuth, storage } from "../contexts/AuthContext";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [role, setRole] = useState("student");
  const [form, setForm] = useState({
    username: "",
    password: "",
    name: "",
    franchiseCode: "",
    school: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Load teacher's code from localStorage for student registration
  useEffect(() => {
    if (mode === "register" && role === "student") {
      const linkedCode = localStorage.getItem("sor_linked_teacher_code");
      if (linkedCode) {
        setForm((f) => ({ ...f, franchiseCode: linkedCode }));
      }
    }
  }, [mode, role]);

  const handleLogin = async () => {
    if (!form.username || !form.password) {
      setError("Please fill all fields");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 300));
    const ok = login(form.username, form.password);
    if (!ok) setError("Invalid username or password");
    setLoading(false);
  };

  // Prefill demo data for Login or Register forms (does not auto-submit)
  const fillDemo = (which) => {
    const now = Date.now();
    if (mode === "login") {
      if (which === "teacher")
        setForm({ ...form, username: "teacher", password: "teacher123" });
      else setForm({ ...form, username: "student", password: "student123" });
    } else {
      if (which === "teacher") {
        setRole("teacher");
        // Generate a demo franchise code
        const demoCode = `DEMO${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        localStorage.setItem("sor_linked_teacher_code", demoCode);
        setForm({
          ...form,
          name: "Demo Teacher",
          username: `teacher_demo_${now}`,
          password: "teacher123",
          school: "Demo School",
        });
      } else {
        setRole("student");
        // Retrieve stored teacher code
        const linkedCode =
          localStorage.getItem("sor_linked_teacher_code") || "ABACUS01";
        setForm({
          ...form,
          name: "Demo Student",
          username: `student_demo_${now}`,
          password: "student123",
          franchiseCode: linkedCode,
        });
      }
    }
    setError("");
  };

  // Full platform reset — wipe all accounts, exams, results, requests and
  // recordings, then reload to a truly empty login screen.
  const handleResetAll = () => {
    const ok = window.confirm(
      "This permanently deletes ALL teachers, students, exams, results, requests and recorded videos. This cannot be undone.\n\nReset the platform to a clean state?",
    );
    if (!ok) return;
    storage.clearAllData();
    try {
      indexedDB.deleteDatabase("AbacusExamDB");
      indexedDB.deleteDatabase("MindMantraExamDB");
    } catch {
      /* ignore */
    }
    setTimeout(() => window.location.reload(), 300);
  };

  const copyCodeToClipboard = () => {
    if (successData?.code) {
      navigator.clipboard.writeText(successData.code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleRegister = async () => {
    if (!form.username || !form.password || !form.name) {
      setError("Please fill all fields");
      return;
    }
    // franchise code is optional for now
    // if (role === 'student' && !form.franchiseCode) { setError('Franchise code required'); return; }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 300));
    const res = register({ ...form, role });
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }

    // Show success modal for teacher registration with code
    if (role === "teacher" && res.franchiseCode) {
      setSuccessData({
        role: "teacher",
        name: form.name,
        code: res.franchiseCode,
      });
      // Store code for student registration
      localStorage.setItem("sor_linked_teacher_code", res.franchiseCode);
      setShowSuccessModal(true);
      setForm({
        username: "",
        password: "",
        name: "",
        franchiseCode: "",
        school: "",
      });
    } else {
      // Student registration success
      setMode("login");
      setError("");
      setForm({
        username: "",
        password: "",
        name: "",
        franchiseCode: "",
        school: "",
      });
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-box">
        {/* Logo */}
        <div className="login-logo">
          <img
            className="login-brand-logo"
            src="/logo.svg"
            alt="Logo"
            onError={(e) => {
              e.target.style.display = "none";
              e.target.nextSibling.style.display = "flex";
            }}
          />
          <div className="login-logo-icon" style={{ display: "none" }}>
            <span
              className="material-icons-round"
              style={{ fontSize: "inherit" }}
            >
              calculate
            </span>
          </div>
          <h1>AbacusExam</h1>
          <p>Abacus Learning Platform for Kids</p>
        </div>

        {/* Main login card */}
        <div className="login-card">
          {/* Mode tabs */}
          <div className="login-tabs">
            <button
              className={`login-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              <span className="material-icons-round" style={{ fontSize: 16 }}>
                login
              </span>{" "}
              Sign In
            </button>
            <button
              className={`login-tab ${mode === "register" ? "active" : ""}`}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              <span className="material-icons-round" style={{ fontSize: 16 }}>
                person_add
              </span>{" "}
              Register
            </button>
          </div>

          {error && (
            <div className="error-msg">
              <span className="material-icons-round" style={{ fontSize: 18 }}>
                warning
              </span>{" "}
              {error}
            </div>
          )}

          {/* ── LOGIN FORM ── */}
          {mode === "login" && (
            <>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  className="form-input"
                  placeholder="Enter username"
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={handleLogin}
                disabled={loading}
              >
                <span className="material-icons-round" style={{ fontSize: 20 }}>
                  arrow_forward
                </span>
                {loading ? "Signing in..." : "Sign In"}
              </button>

              {/* ── QUICK DEMO LOGIN ── */}
              <div className="demo-login">
                <div className="demo-login-divider">
                  <span>Quick Demo Login</span>
                </div>
                <div className="demo-login-buttons">
                  <button
                    type="button"
                    className="btn btn-demo"
                    onClick={() => fillDemo("teacher")}
                    disabled={loading}
                  >
                    <span
                      className="material-icons-round"
                      style={{ fontSize: 18 }}
                    >
                      school
                    </span>
                    Demo Teacher
                  </button>
                  <button
                    type="button"
                    className="btn btn-demo"
                    onClick={() => fillDemo("student")}
                    disabled={loading}
                  >
                    <span
                      className="material-icons-round"
                      style={{ fontSize: 18 }}
                    >
                      menu_book
                    </span>
                    Demo Student
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── REGISTER FORM ── */}
          {mode === "register" && (
            <>
              {/* Role toggle */}
              <div className="login-tabs" style={{ marginBottom: 22 }}>
                <button
                  className={`login-tab ${role === "student" ? "active" : ""}`}
                  onClick={() => {
                    setRole("student");
                    setError("");
                  }}
                >
                  <span
                    className="material-icons-round"
                    style={{ fontSize: 16 }}
                  >
                    menu_book
                  </span>{" "}
                  Student
                </button>
                <button
                  className={`login-tab ${role === "teacher" ? "active" : ""}`}
                  onClick={() => {
                    setRole("teacher");
                    setError("");
                  }}
                >
                  <span
                    className="material-icons-round"
                    style={{ fontSize: 16 }}
                  >
                    school
                  </span>{" "}
                  Teacher
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  className="form-input"
                  placeholder="Your full name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  className="form-input"
                  placeholder="Choose a username"
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Choose a password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                />
              </div>

              {role === "teacher" && (
                <div className="form-group">
                  <label className="form-label">School / Franchise Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Abacus World Academy"
                    value={form.school}
                    onChange={(e) => set("school", e.target.value)}
                  />
                </div>
              )}

              {role === "student" && (
                <div className="form-group">
                  <label className="form-label">Teacher's Franchise Code</label>
                  <input
                    className="form-input"
                    placeholder="e.g. ABACUS01"
                    value={form.franchiseCode}
                    onChange={(e) =>
                      set("franchiseCode", e.target.value.toUpperCase())
                    }
                    style={{
                      letterSpacing: 2,
                      fontFamily: "'Inter', monospace",
                    }}
                  />
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--text-muted)",
                      marginTop: 6,
                    }}
                  >
                    Ask your teacher for their franchise code
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={handleRegister}
                disabled={loading}
              >
                <span className="material-icons-round" style={{ fontSize: 20 }}>
                  how_to_reg
                </span>
                {loading ? "Creating account..." : "Create Account"}
              </button>
            </>
          )}
        </div>

        {/* Success Modal - Teacher Registration */}
        {showSuccessModal && successData && (
          <div
            className="modal-overlay"
            onClick={() => setShowSuccessModal(false)}
          >
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  <span
                    className="material-icons-round"
                    style={{ fontSize: 28, color: "#4CAF50" }}
                  >
                    check_circle
                  </span>
                  Account Created!
                </h2>
              </div>
              <div className="modal-content">
                <p
                  style={{
                    marginBottom: 16,
                    fontSize: "0.95rem",
                    color: "var(--text-muted)",
                  }}
                >
                  Welcome <strong>{successData.name}</strong>! Your teacher
                  account is ready.
                </p>

                <div
                  style={{
                    backgroundColor: "#f5f5f5",
                    padding: "16px",
                    borderRadius: "8px",
                    marginBottom: 20,
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      marginBottom: 8,
                    }}
                  >
                    Share this code with students to join your class:
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <code
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: "bold",
                        letterSpacing: 2,
                        fontFamily: "'Courier New', monospace",
                        backgroundColor: "white",
                        padding: "8px 12px",
                        borderRadius: "4px",
                        border: "2px solid #2196F3",
                      }}
                    >
                      {successData.code}
                    </code>
                    <button
                      className="btn btn-icon"
                      onClick={copyCodeToClipboard}
                      title="Copy code"
                      style={{
                        width: 40,
                        height: 40,
                        padding: 0,
                        borderRadius: "50%",
                        backgroundColor: codeCopied ? "#4CAF50" : "#2196F3",
                        color: "white",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 18,
                      }}
                    >
                      <span
                        className="material-icons-round"
                        style={{ fontSize: 18 }}
                      >
                        {codeCopied ? "check" : "content_copy"}
                      </span>
                    </button>
                  </div>
                  {codeCopied && (
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "#4CAF50",
                        fontWeight: 500,
                      }}
                    >
                      ✓ Copied to clipboard
                    </p>
                  )}
                </div>

                <p
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-muted)",
                    marginBottom: 16,
                  }}
                >
                  <strong>Next step:</strong> Students can register using this
                  code to join your class.
                </p>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-full"
                    onClick={() => {
                      setShowSuccessModal(false);
                      setMode("login");
                    }}
                  >
                    Go to Login
                  </button>
                  <button
                    className="btn btn-primary btn-full"
                    onClick={() => {
                      setShowSuccessModal(false);
                      setMode("register");
                      setRole("student");
                      setForm({
                        username: "",
                        password: "",
                        name: "",
                        franchiseCode: successData.code,
                        school: "",
                      });
                    }}
                  >
                    Register Student
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="login-footer">AbacusExam &bull; Learning Platform v1.0</p>

        {storage.demo.enabled ? (
          <p
            style={{
              textAlign: "center",
              margin: "8px auto 0",
              color: "rgba(255,255,255,0.4)",
              fontSize: "0.72rem",
            }}
          >
            Demo build — one full test per device.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleResetAll}
            title="Delete all data and start fresh"
            style={{
              display: "block",
              margin: "8px auto 0",
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.4)",
              fontSize: "0.72rem",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Reset all data
          </button>
        )}
      </div>
    </div>
  );
}
