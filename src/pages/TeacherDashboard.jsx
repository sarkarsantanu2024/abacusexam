import React, { useState, useMemo } from "react";
import { useAuth, storage } from "../contexts/AuthContext";
import {
  LEVELS,
  LEVEL_KEYS,
  parseAbacusQuestions,
  generateExam,
  encodeShareCode,
  solveChain,
  capExamChains,
} from "../utils/questions";
import { getRecording } from "./ExamMode";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudent, setNewStudent] = useState({
    name: "",
    username: "",
    password: "",
  });
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [refresh, setRefresh] = useState(0); // force re-read after deletes
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [playbackStudent, setPlaybackStudent] = useState("");
  const [recMsg, setRecMsg] = useState("");
  const [requests, setRequests] = useState(() => storage.getExamRequests());

  // One place to open a recording, with clear feedback when there isn't one.
  const playRecording = async (key, studentName) => {
    if (!key) {
      setRecMsg("No recording was saved for this attempt.");
      setTimeout(() => setRecMsg(""), 3500);
      return;
    }
    try {
      const blob = await getRecording(key);
      if (blob) {
        setPlaybackUrl(URL.createObjectURL(blob));
        setPlaybackStudent(studentName || "Student");
      } else {
        setRecMsg(
          "Recording not found — it may have been saved on another device or browser.",
        );
        setTimeout(() => setRecMsg(""), 4500);
      }
    } catch {
      setRecMsg("Sorry, this recording could not be loaded.");
      setTimeout(() => setRecMsg(""), 3500);
    }
  };

  const reloadRequests = () => setRequests(storage.getExamRequests());
  const myRequests = requests.filter((r) => r.teacherId === user.id);
  const pendingCount = myRequests.filter((r) => r.status === "pending").length;

  const decideRequest = (id, status) => {
    storage.updateExamRequest(id, {
      status,
      decidedAt: new Date().toISOString(),
      teacherNote:
        status === "approved"
          ? "Cancellation approved."
          : "Request rejected — please retake the exam.",
    });
    reloadRequests();
  };

  const allUsers = storage.getUsers();
  // Only this teacher's own students — never other teachers'/demo students.
  const students = useMemo(
    () =>
      allUsers.filter((u) => u.role === "student" && u.teacherId === user.id),
    [allUsers, tab, user.id, refresh],
  );
  const allScores = storage.getAllScores();

  const getStudentStats = (s) => {
    const scores = allScores[s.id] || [];
    const total = scores.length;
    const avg = total
      ? Math.round(
          scores.reduce((a, r) => a + (r.correct / r.total) * 100, 0) / total,
        )
      : 0;
    const lastActive = total
      ? new Date(scores[0].date).toLocaleDateString()
      : "Never";
    return { total, avg, lastActive };
  };

  const handleDeleteStudent = (s) => {
    const ok = window.confirm(
      `Remove ${s.name} (${s.username}) and all their sessions, results and requests? This cannot be undone.`,
    );
    if (!ok) return;
    storage.deleteStudent(s.id);
    setRequests(storage.getExamRequests());
    setRefresh((r) => r + 1);
  };

  const handleAddStudent = () => {
    setAddError("");
    if (storage.demo.capReached("students")) {
      setAddError(
        "Demo limit reached — only one student can be added on this device.",
      );
      return;
    }
    if (!newStudent.name || !newStudent.username || !newStudent.password) {
      setAddError("All fields required");
      return;
    }
    const users = storage.getUsers();
    if (
      users.find(
        (u) => u.username.toLowerCase() === newStudent.username.toLowerCase(),
      )
    ) {
      setAddError("Username already taken");
      return;
    }
    const created = {
      id: "student_" + Date.now(),
      username: newStudent.username,
      password: newStudent.password,
      name: newStudent.name,
      role: "student",
      teacherId: user.id,
      level: "basic",
      xp: 0,
    };
    storage.saveUsers([...users, created]);
    storage.demo.bump("students");
    setAddSuccess(
      `${created.name} added! Login: ${created.username} / ${created.password}`,
    );
    setNewStudent({ name: "", username: "", password: "" });
    setTimeout(() => setAddSuccess(""), 5000);
  };

  // Overview stats
  const totalSessions = students.reduce(
    (s, st) => s + (allScores[st.id]?.length || 0),
    0,
  );
  const avgAccuracy = students.length
    ? Math.round(
        students.reduce((s, st) => {
          const sc = allScores[st.id] || [];
          return (
            s +
            (sc.length
              ? (sc.reduce((a, r) => a + r.correct / r.total, 0) / sc.length) *
                100
              : 0)
          );
        }, 0) / students.length,
      )
    : 0;

  return (
    <div className="page-content">
      {/* Transient toast for recording feedback */}
      {recMsg && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#002554",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: "0.85rem",
            boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            gap: 8,
            maxWidth: "90vw",
          }}
        >
          <span
            className="material-icons-round"
            style={{ fontSize: 18, color: "var(--gold)" }}
          >
            info
          </span>
          {recMsg}
        </div>
      )}

      {/* Video playback modal for teacher */}
      {playbackUrl && (
        <div
          className="modal-overlay"
          onClick={() => {
            setPlaybackUrl(null);
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
              Exam Recording — {playbackStudent}
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
                URL.revokeObjectURL(playbackUrl);
                setPlaybackUrl(null);
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="dashboard-hero">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div className="hero-greeting">
              <span
                className="material-icons-round"
                style={{
                  fontSize: 22,
                  verticalAlign: "middle",
                  marginRight: 4,
                }}
              >
                school
              </span>{" "}
              {user.school || "Your School Name"}
            </div>
            <div className="hero-subtitle">Teacher: {user.name}</div>
          </div>

          <div
            style={{
              background: "rgba(254,101,31,0.15)",
              border: "1px solid rgba(254,101,31,0.3)",
              borderRadius: 10,
              padding: "8px 16px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "0.7rem",
                color: "rgba(255,255,255,0.6)",
                marginBottom: 2,
              }}
            >
              FRANCHISE CODE
            </div>
            <div
              style={{
                fontFamily: "monospace",
                fontWeight: 800,
                fontSize: "1.2rem",
                letterSpacing: 2,
                color: "var(--accent)",
              }}
            >
              {user.franchiseCode}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value text-accent">{students.length}</div>
          <div className="stat-label">Students</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-success">{totalSessions}</div>
          <div className="stat-label">Total Sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "var(--teal)" }}>
            {avgAccuracy}%
          </div>
          <div className="stat-label">Avg Accuracy</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {["overview", "students", "upload-exam", "manage-exams", "requests"].map(
          (t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "overview" && (
              <>
                <span
                  className="material-icons-round"
                  style={{ fontSize: 16, verticalAlign: "middle" }}
                >
                  bar_chart
                </span>{" "}
                Overview
              </>
            )}
            {t === "students" && (
              <>
                <span
                  className="material-icons-round"
                  style={{ fontSize: 16, verticalAlign: "middle" }}
                >
                  group
                </span>{" "}
                Students
              </>
            )}
            {t === "upload-exam" && (
              <>
                <span
                  className="material-icons-round"
                  style={{ fontSize: 16, verticalAlign: "middle" }}
                >
                  upload_file
                </span>{" "}
                Upload Exam
              </>
            )}
            {t === "manage-exams" && (
              <>
                <span
                  className="material-icons-round"
                  style={{ fontSize: 16, verticalAlign: "middle" }}
                >
                  folder
                </span>{" "}
                Exams
              </>
            )}
            {t === "requests" && (
              <>
                <span
                  className="material-icons-round"
                  style={{ fontSize: 16, verticalAlign: "middle" }}
                >
                  rule
                </span>{" "}
                Requests
                {pendingCount > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      background: "var(--danger)",
                      color: "#fff",
                      borderRadius: 20,
                      padding: "1px 7px",
                      fontSize: "0.7rem",
                      fontWeight: 800,
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
              </>
            )}
          </button>
          )
        )}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && (
        <div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>
              Student Activity
            </div>
            {students.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <span
                    className="material-icons-round"
                    style={{ fontSize: "inherit" }}
                  >
                    group
                  </span>
                </div>
                <p>
                  No students yet. Share your franchise code{" "}
                  <strong style={{ color: "var(--accent)" }}>
                    {user.franchiseCode}
                  </strong>{" "}
                  with students to join.
                </p>
              </div>
            ) : (
              students.slice(0, 5).map((s) => {
                const stats = getStudentStats(s);
                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Last active: {stats.lastActive}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="level-badge">
                        {LEVELS[s.level]?.name || s.level}
                      </span>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--text-muted)",
                          marginTop: 4,
                        }}
                      >
                        {stats.avg}% avg
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Exam Results Overview */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>
              Recent Exam Results
            </div>
            {(() => {
              const allResults = storage.getAllExamResults();
              const studentResults = [];
              students.forEach((s) => {
                (allResults[s.id] || []).forEach((r) => {
                  studentResults.push({
                    ...r,
                    studentName: s.name,
                    studentId: s.id,
                  });
                });
              });
              studentResults.sort(
                (a, b) => new Date(b.date) - new Date(a.date),
              );

              if (studentResults.length === 0) {
                return (
                  <div
                    style={{
                      textAlign: "center",
                      color: "var(--text-muted)",
                      padding: 20,
                      fontSize: "0.85rem",
                    }}
                  >
                    No exam results yet. Upload an exam paper for students to
                    take.
                  </div>
                );
              }

              return studentResults.slice(0, 10).map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "0.85rem",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    {/* Recording thumbnail — click to play (or learn why not) */}
                    <div
                      className={`teacher-rec-thumb ${r.recordingKey ? "" : "no-rec"}`}
                      title={
                        r.recordingKey
                          ? "Watch exam recording"
                          : "No recording for this attempt"
                      }
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        playRecording(r.recordingKey, r.studentName)
                      }
                    >
                      <span
                        className="material-icons-round"
                        style={{ fontSize: r.recordingKey ? 18 : 16 }}
                      >
                        {r.recordingKey ? "play_circle" : "videocam_off"}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.studentName}</div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.75rem",
                        }}
                      >
                        {r.examTitle} • {new Date(r.date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color:
                          r.totalMarks / r.maxMarks >= 0.7
                            ? "var(--success)"
                            : "var(--danger)",
                      }}
                    >
                      {r.totalMarks}/{r.maxMarks}
                    </div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {Math.round((r.totalMarks / r.maxMarks) * 100)}%
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ── STUDENTS TAB ── */}
      {tab === "students" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div className="section-title">
              All Students ({students.length})
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowAddStudent(true)}
            >
              + Add Student
            </button>
          </div>

          {addSuccess && (
            <div
              style={{
                background: "rgba(107,203,119,0.1)",
                border: "1px solid rgba(107,203,119,0.3)",
                color: "var(--success)",
                padding: "10px 14px",
                borderRadius: 10,
                marginBottom: 16,
                fontSize: "0.85rem",
              }}
            >
              {addSuccess}
            </div>
          )}

          {students.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <span
                  className="material-icons-round"
                  style={{ fontSize: "inherit" }}
                >
                  group
                </span>
              </div>
              <p>
                No students yet. Add manually or share franchise code{" "}
                <strong style={{ color: "var(--accent)" }}>
                  {user.franchiseCode}
                </strong>
                .
              </p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Level</th>
                    <th>Sessions</th>
                    <th>Accuracy</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const stats = getStudentStats(s);
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td
                          style={{
                            color: "var(--text-muted)",
                            fontFamily: "monospace",
                          }}
                        >
                          {s.username}
                        </td>
                        <td>
                          <span className="level-badge">
                            {LEVELS[s.level]?.name || s.level}
                          </span>
                        </td>
                        <td>{stats.total}</td>
                        <td>
                          <span
                            style={{
                              color:
                                stats.avg >= 80
                                  ? "var(--success)"
                                  : stats.avg >= 50
                                    ? "var(--gold)"
                                    : "var(--danger)",
                              fontWeight: 700,
                            }}
                          >
                            {stats.avg}%
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            title={`Remove ${s.name} and all their data`}
                            onClick={() => handleDeleteStudent(s)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--danger)",
                              display: "inline-flex",
                              padding: 4,
                            }}
                          >
                            <span
                              className="material-icons-round"
                              style={{ fontSize: 18 }}
                            >
                              delete_outline
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Add student modal */}
          {showAddStudent && (
            <div
              className="modal-overlay"
              onClick={() => setShowAddStudent(false)}
            >
              <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">
                  <span
                    className="material-icons-round"
                    style={{
                      fontSize: 20,
                      verticalAlign: "middle",
                      marginRight: 4,
                    }}
                  >
                    person_add
                  </span>{" "}
                  Add New Student
                </div>
                {addError && <div className="error-msg">{addError}</div>}
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    className="form-input"
                    placeholder="Student's name"
                    value={newStudent.name}
                    onChange={(e) =>
                      setNewStudent((s) => ({ ...s, name: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input
                    className="form-input"
                    placeholder="Login username"
                    value={newStudent.username}
                    onChange={(e) =>
                      setNewStudent((s) => ({ ...s, username: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    className="form-input"
                    placeholder="Initial password"
                    value={newStudent.password}
                    onChange={(e) =>
                      setNewStudent((s) => ({ ...s, password: e.target.value }))
                    }
                  />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleAddStudent}
                  >
                    Add Student
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setShowAddStudent(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── UPLOAD EXAM TAB ── */}
      {tab === "upload-exam" && <ExamUploader user={user} />}

      {/* ── MANAGE EXAMS TAB ── */}
      {tab === "manage-exams" && <ExamManager user={user} />}

      {/* ── REQUESTS TAB ── */}
      {tab === "requests" && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>
            Exam Cancellation Requests
          </div>
          {myRequests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <span
                  className="material-icons-round"
                  style={{ fontSize: "inherit" }}
                >
                  inbox
                </span>
              </div>
              <p>No cancellation requests from your students.</p>
            </div>
          ) : (
            myRequests.map((r) => {
              const pill =
                r.status === "approved"
                  ? { bg: "rgba(46,204,113,0.12)", col: "var(--success)", label: "Approved" }
                  : r.status === "rejected"
                    ? { bg: "rgba(231,76,60,0.12)", col: "var(--danger)", label: "Rejected" }
                    : { bg: "rgba(243,156,18,0.12)", col: "var(--warn)", label: "Pending" };
              return (
                <div
                  key={r.id}
                  className="card"
                  style={{ marginBottom: 12, padding: 16 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                        {r.studentName}
                      </div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {r.examTitle} • answered {r.answered ?? 0}/
                        {r.totalQuestions ?? 0} •{" "}
                        {r.createdAt
                          ? new Date(r.createdAt).toLocaleString()
                          : ""}
                      </div>
                    </div>
                    <span
                      style={{
                        background: pill.bg,
                        color: pill.col,
                        borderRadius: 20,
                        padding: "3px 12px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {pill.label}
                    </span>
                  </div>

                  <div
                    style={{
                      background: "var(--bg2)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      fontSize: "0.85rem",
                      color: "var(--text)",
                      marginBottom: 12,
                    }}
                  >
                    <strong style={{ color: "var(--text-muted)" }}>
                      Reason:
                    </strong>{" "}
                    {r.reason}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {r.recordingKey && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          playRecording(r.recordingKey, r.studentName)
                        }
                      >
                        <span
                          className="material-icons-round"
                          style={{ fontSize: 15, verticalAlign: "middle", marginRight: 4 }}
                        >
                          play_circle
                        </span>
                        View Recording
                      </button>
                    )}
                    {r.status === "pending" ? (
                      <>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ background: "var(--success)", borderColor: "var(--success)" }}
                          onClick={() => decideRequest(r.id, "approved")}
                        >
                          <span
                            className="material-icons-round"
                            style={{ fontSize: 15, verticalAlign: "middle", marginRight: 4 }}
                          >
                            check
                          </span>
                          Approve
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                          onClick={() => decideRequest(r.id, "rejected")}
                        >
                          <span
                            className="material-icons-round"
                            style={{ fontSize: 15, verticalAlign: "middle", marginRight: 4 }}
                          >
                            close
                          </span>
                          Reject
                        </button>
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--text-muted)",
                          alignSelf: "center",
                        }}
                      >
                        {r.teacherNote}
                        {r.decidedAt
                          ? ` (${new Date(r.decidedAt).toLocaleDateString()})`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── EXAM UPLOADER ──────────────────────────────────────────
function ExamUploader({ user }) {
  const [level, setLevel] = useState("basic");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState("upload"); // 'upload' | 'generate'

  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    setSuccess("");
    setPreview(null);
    setFileName(file.name);
    setLoading(true);

    const ext = file.name.split(".").pop().toLowerCase();

    try {
      let text = "";

      if (ext === "txt") {
        text = await readFileAsText(file);
      } else if (ext === "pdf") {
        if (!window.pdfjsLib) {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer })
          .promise;
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map((item) => item.str).join(" "));
        }
        text = pages.join("\n");
      } else if (ext === "doc" || ext === "docx") {
        if (!window.mammoth) {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src =
              "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const result = await window.mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        throw new Error("Unsupported file type. Use PDF, DOC, DOCX, or TXT.");
      }

      if (!text.trim()) {
        throw new Error("No text found in the file.");
      }

      // Parse the abacus questions
      const parsed = parseAbacusQuestions(text);

      // Build exam object
      const examTitle = title || file.name.replace(/\.[^.]+$/, "");
      const exam = {
        title: examTitle,
        level,
        levelName: LEVELS[level]?.name || level,
        totalTime: 20 * 60,
        fullMarks: 80,
        teacher: user.name,
        teacherId: user.id,
        fileName: file.name,
        sections: [
          {
            name: parsed.abacus.name,
            marksEach: 1,
            questions: parsed.abacus.questions.map((chain) => ({
              chain,
              answer: solveChain(chain),
            })),
          },
          {
            name: parsed.finger.name,
            marksEach: 1,
            questions: parsed.finger.questions.map((chain) => ({
              chain,
              answer: solveChain(chain),
            })),
          },
          {
            name: parsed.mental.name,
            marksEach: 1.5,
            questions: parsed.mental.questions.map((chain) => ({
              chain,
              answer: solveChain(chain),
            })),
          },
        ],
      };

      setPreview(exam);
    } catch (e) {
      setError("Error: " + e.message);
    }
    setLoading(false);
  };

  const handleGenerate = () => {
    const examTitle = title || `${LEVELS[level]?.name || level} Practice Exam`;
    const exam = generateExam(level);
    exam.title = examTitle;
    exam.teacher = user.name;
    exam.teacherId = user.id;
    setPreview(exam);
  };

  const saveExam = () => {
    if (!preview) return;
    if (storage.demo.capReached("exams")) {
      setError(
        "Demo limit reached — only one exam can be saved on this device.",
      );
      setPreview(null);
      setTimeout(() => setError(""), 4000);
      return;
    }
    storage.saveExam(preview);
    storage.demo.bump("exams");
    setSuccess("Exam saved successfully! Students can now take this exam.");
    setPreview(null);
    setFileName("");
    setTitle("");
    setTimeout(() => setSuccess(""), 4000);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  return (
    <div className="upload-section">
      <div className="upload-title">
        <span
          className="material-icons-round"
          style={{ fontSize: 22, verticalAlign: "middle" }}
        >
          upload_file
        </span>{" "}
        Create Exam Paper
      </div>
      <div className="upload-sub">
        Upload a question PDF or auto-generate an exam
      </div>

      {/* Mode toggle */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        <button
          className={`tab ${mode === "upload" ? "active" : ""}`}
          onClick={() => setMode("upload")}
        >
          <span className="material-icons-round" style={{ fontSize: 16 }}>
            upload_file
          </span>{" "}
          Upload PDF
        </button>
        <button
          className={`tab ${mode === "generate" ? "active" : ""}`}
          onClick={() => setMode("generate")}
        >
          <span className="material-icons-round" style={{ fontSize: 16 }}>
            auto_fix_high
          </span>{" "}
          Auto Generate
        </button>
      </div>

      {/* Title & Level */}
      <div className="form-group">
        <label className="form-label">Exam Title</label>
        <input
          className="form-input"
          placeholder="e.g. Monthly Test - March 2026"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Level</label>
        <select
          className="form-input"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          {LEVEL_KEYS.map((k) => (
            <option key={k} value={k}>
              {LEVELS[k].name} — {LEVELS[k].desc}
            </option>
          ))}
        </select>
      </div>

      {mode === "upload" ? (
        <>
          {/* Drop zone */}
          <div
            className={`upload-dropzone${dragging ? " dragging" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragging(false)}
            onClick={() => document.getElementById("exam-file-input").click()}
          >
            <input
              id="exam-file-input"
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
            {loading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <div className="spinner" />
                <span style={{ color: "var(--text-muted)" }}>
                  Parsing {fileName}...
                </span>
              </div>
            ) : (
              <>
                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>
                  <span
                    className="material-icons-round"
                    style={{ fontSize: "inherit" }}
                  >
                    folder_open
                  </span>
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 4,
                    color: "var(--text)",
                  }}
                >
                  {fileName
                    ? `Selected: ${fileName}`
                    : "Drop question PDF here or click to browse"}
                </div>
                <div
                  style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}
                >
                  Supports PDF, DOC, DOCX, and TXT
                </div>
              </>
            )}
          </div>

          {/* Format guide */}
          <div
            style={{
              marginTop: 12,
              padding: "12px 16px",
              background: "var(--bg)",
              borderRadius: 10,
              fontSize: "0.82rem",
              color: "var(--text-muted)",
            }}
          >
            <strong style={{ color: "var(--text)" }}>Supported format:</strong>{" "}
            Abacus exam papers with sections — "Do with Abacus", "Do with
            Finger", "Do with Mentally". Each question is a vertical chain of
            numbers.
          </div>
        </>
      ) : (
        <button className="btn btn-primary btn-full" onClick={handleGenerate}>
          <span
            className="material-icons-round"
            style={{ fontSize: 18, verticalAlign: "middle", marginRight: 4 }}
          >
            auto_fix_high
          </span>
          Generate {LEVELS[level]?.name} Exam
        </button>
      )}

      {error && (
        <div className="error-msg" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            marginTop: 12,
            background: "rgba(107,203,119,0.1)",
            border: "1px solid rgba(107,203,119,0.3)",
            color: "var(--success)",
            padding: "12px 16px",
            borderRadius: 10,
            fontSize: "0.85rem",
          }}
        >
          <span
            className="material-icons-round"
            style={{ fontSize: 16, verticalAlign: "middle", marginRight: 4 }}
          >
            check_circle
          </span>
          {success}
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div
          className="modal-overlay"
          onClick={() => setPreview(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-xl)",
              padding: 0,
              width: "100%",
              maxWidth: 640,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 70px rgba(0,37,84,0.45)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                background: "linear-gradient(135deg, var(--card), var(--card2))",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <span
                className="material-icons-round"
                style={{
                  fontSize: 26,
                  color: "var(--accent)",
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                preview
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                  Exam Preview
                </h2>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "0.8rem",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  <strong>{preview.title}</strong> • {preview.levelName} •{" "}
                  {preview.fullMarks} marks • {preview.totalTime / 60} min
                </p>
              </div>
            </div>

            {/* Modal Content - Scrollable */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 24px",
                background: "var(--bg2)",
              }}
            >
              {preview.sections.map((sec, i) => (
                <div key={i} style={{ marginBottom: 24 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      marginBottom: 12,
                      color: "var(--text)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "white",
                        borderRadius: "50%",
                        width: 24,
                        height: 24,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                      }}
                    >
                      {i + 1}
                    </span>
                    {sec.name} ({sec.questions.length} questions,{" "}
                    {sec.marksEach} mark each)
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {sec.questions.map((q, j) => (
                      <div
                        key={j}
                        style={{
                          background: "var(--surface)",
                          borderRadius: 8,
                          padding: "10px 14px",
                          fontSize: "0.85rem",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          border: "1px solid var(--border)",
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor =
                            "var(--accent-dim)";
                          e.currentTarget.style.borderColor = "var(--accent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor =
                            "var(--surface)";
                          e.currentTarget.style.borderColor = "var(--border)";
                        }}
                      >
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontWeight: 700,
                            minWidth: 32,
                            backgroundColor: "var(--bg2)",
                            padding: "4px 8px",
                            borderRadius: 4,
                            textAlign: "center",
                          }}
                        >
                          Q{j + 1}
                        </span>
                        <span style={{ fontFamily: "monospace", flex: 1 }}>
                          {q.chain.map((n, ni) => (
                            <span
                              key={ni}
                              style={{
                                color: n < 0 ? "var(--danger)" : "var(--text)",
                                fontWeight: n < 0 ? 600 : 500,
                              }}
                            >
                              {ni > 0 && n >= 0 ? " +" : ni > 0 ? " " : ""}
                              {n}
                            </span>
                          ))}
                        </span>
                        <span
                          style={{
                            fontWeight: 700,
                            color: "white",
                            backgroundColor: "var(--success)",
                            borderRadius: 6,
                            padding: "4px 10px",
                            minWidth: 50,
                            textAlign: "center",
                          }}
                        >
                          = {q.answer}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--border)",
                background: "var(--surface)",
                display: "flex",
                gap: 10,
              }}
            >
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={saveExam}
              >
                <span
                  className="material-icons-round"
                  style={{
                    fontSize: 16,
                    verticalAlign: "middle",
                    marginRight: 4,
                  }}
                >
                  save
                </span>
                Save Exam
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => openExamPdf(preview)}
              >
                <span
                  className="material-icons-round"
                  style={{
                    fontSize: 16,
                    verticalAlign: "middle",
                    marginRight: 4,
                  }}
                >
                  picture_as_pdf
                </span>
                PDF
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setPreview(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PDF helper ─────────────────────────────────────────────
function openExamPdf(exam) {
  exam = capExamChains(exam); // self-heal any old runaway chains
  const w = window.open("", "_blank");
  if (!w) return;
  const totalQ =
    exam.sections?.reduce((s, sec) => s + sec.questions.length, 0) || 0;
  w.document
    .write(`<!DOCTYPE html><html><head><title>${exam.title} - Exam</title><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#222;max-width:900px;margin:0 auto}
    h1{font-size:18px;margin-bottom:4px}
    .meta{font-size:13px;color:#666;margin-bottom:16px}
    .sec{margin-bottom:18px}
    .sec-title{font-weight:700;font-size:14px;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px}
    .q{display:flex;align-items:center;gap:8px;padding:4px 8px;font-size:13px;font-family:monospace;border-bottom:1px solid #f0f0f0}
    .q:nth-child(even){background:#f9f9f9}
    .qlabel{font-weight:600;color:#888;min-width:28px;font-family:Arial}
    .chain{flex:1}
    .neg{color:#d32f2f}
    .ans{font-weight:700;color:#2e7d32;padding-left:10px;border-left:1px solid #ccc;margin-left:10px}
    @media print{body{padding:12px}.no-print{display:none!important}}
  </style></head><body>
  <h1>${exam.title}</h1>
  <div class="meta">${exam.levelName || exam.level || ""} &bull; ${totalQ} questions &bull; ${exam.fullMarks} marks &bull; ${exam.totalTime ? exam.totalTime / 60 + " min" : ""}</div>
  ${(exam.sections || [])
    .map(
      (sec) => `<div class="sec">
    <div class="sec-title">${sec.name} (${sec.questions.length} questions, ${sec.marksEach} mark each)</div>
    ${sec.questions
      .map(
        (q, j) => `<div class="q">
      <span class="qlabel">Q${j + 1}</span>
      <span class="chain">${q.chain.map((n, ni) => `<span class="${n < 0 ? "neg" : ""}">${ni > 0 && n >= 0 ? " +" : ni > 0 ? " " : ""}${n}</span>`).join("")}</span>
      <span class="ans">= ${q.answer}</span>
    </div>`,
      )
      .join("")}
  </div>`,
    )
    .join("")}
  <br/><button class="no-print" onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#e65100;color:#fff;border:none;border-radius:6px">Print / Save as PDF</button>
  </body></html>`);
  w.document.close();
}

// ─── EXAM MANAGER (share, delete, view) ─────────────────────
function ExamManager({ user }) {
  const [exams, setExams] = useState(() =>
    storage.getExams().filter((e) => e.teacherId === user.id),
  );
  const [shareCode, setShareCode] = useState("");
  const [showShareModal, setShowShareModal] = useState(null);
  const [copyMsg, setCopyMsg] = useState("");

  const handleShare = (exam) => {
    const code = encodeShareCode(exam);
    setShareCode(code);
    setShowShareModal(exam.id);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyMsg("Copied!");
      setTimeout(() => setCopyMsg(""), 2000);
    });
  };

  const handleExport = (exam) => {
    const json = JSON.stringify(exam, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exam.title || "exam"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = (id) => {
    storage.deleteExam(id);
    setExams((prev) => prev.filter((e) => e.id !== id));
  };

  if (exams.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <span
            className="material-icons-round"
            style={{ fontSize: "inherit" }}
          >
            folder_open
          </span>
        </div>
        <p>No exams created yet. Go to "Upload Exam" to create one.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title" style={{ marginBottom: 12 }}>
        Your Exam Papers ({exams.length})
      </div>

      {exams.map((exam) => {
        const totalQ =
          exam.sections?.reduce((s, sec) => s + sec.questions.length, 0) || 0;
        return (
          <div
            key={exam.id}
            className="card"
            style={{ marginBottom: 12, padding: 16 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                  {exam.title}
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                    marginTop: 2,
                  }}
                >
                  {exam.levelName || exam.level} • {totalQ} questions •{" "}
                  {exam.fullMarks} marks •
                  {exam.createdAt
                    ? ` ${new Date(exam.createdAt).toLocaleDateString()}`
                    : ""}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => openExamPdf(exam)}
              >
                <span className="material-icons-round" style={{ fontSize: 14 }}>
                  picture_as_pdf
                </span>{" "}
                Download PDF
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)" }}
                onClick={() => handleDelete(exam.id)}
              >
                <span className="material-icons-round" style={{ fontSize: 14 }}>
                  delete
                </span>{" "}
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
