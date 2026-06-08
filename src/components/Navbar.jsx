import React from "react";
import { useAuth } from "../contexts/AuthContext";

export default function Navbar() {
  const { user, logout, navigate } = useAuth();

  return (
    <nav className="navbar">
      <div
        className="navbar-brand"
        onClick={() =>
          navigate(
            user?.role === "teacher"
              ? "teacher-dashboard"
              : "student-dashboard",
          )
        }
      >
        <img
          className="navbar-logo-img"
          src="/logo.svg"
          alt="Logo"
          onError={(e) => {
            e.target.style.display = "none";
            e.target.nextSibling.style.display = "flex";
          }}
        />
        <div className="navbar-logo" style={{ display: "none" }}>
          <span className="material-icons-round">calculate</span>
        </div>
        <span className="navbar-brand-text">AbacusExam</span>
      </div>

      <div className="navbar-right">
        {user && (
          <>
            <div className="user-badge">
              <span>{user.name.split(" ")[0]}</span>
              <span className={`role-pill ${user.role}`}>{user.role}</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Sign out
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
