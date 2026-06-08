# SorobanAI – Abacus Learning Platform

A full-featured Soroban abacus learning SaaS built with React + Vite.

## Features

- 🧮 **Real Soroban UI** — draggable heaven/earth beads with authentic positioning
- 🔐 **Student & Teacher Login** — role-based access, localStorage persistence
- 📐 **Practice Mode** — 5 difficulty levels (L1–L5), 10 questions per session
- 🏆 **Daily Challenge** — 10 timed questions per day with bonus XP
- 🧮 **Free Play** — explore the Soroban without pressure
- 👥 **Teacher Dashboard** — manage students, view stats, franchise code system
- 🤖 **AI Question Generator** — uses Claude AI to generate custom question sets
- 📊 **XP & Level system** — students earn XP and level up
- 📱 **Mobile-ready** — works on phones and tablets, PWA-capable

## Demo Credentials

| Role    | Username | Password   |
| ------- | -------- | ---------- |
| Teacher | teacher  | teacher123 |
| Student | student  | student123 |
| Student | arjun    | arjun123   |

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build for Production

```bash
npm run build
npm run preview
```

## Teacher Franchise Code System

1. Teacher registers → gets a unique **franchise code** (e.g. `ABACUS01`)
2. Students register using the teacher's franchise code
3. Teacher can also add students manually from the dashboard

## AI Question Generator

1. Go to Teacher Dashboard → AI Generator tab
2. Enter your Anthropic API key (get it at console.anthropic.com)
3. Choose difficulty level and question count
4. Click "Generate Questions with AI"

## Web-only demo

This repository is prepared as a web-only demo for client preview. Android APKs and native builds are not required for the demo.

If you want to remove the existing Android project and build artifacts from your local copy, run the provided PowerShell cleanup script:

```powershell
.
\scripts\remove-android.ps1
```

## Project Structure

```
src/
  App.jsx                    # Router + shell
  index.css                  # Full design system
  main.jsx                   # Entry point
  contexts/
    AuthContext.jsx           # Auth, navigation, localStorage
  utils/
    questions.js              # Question generation, XP, grades
  components/
    Navbar.jsx                # Top navigation
    Soroban.jsx               # 5-column abacus frame
    SorobanColumn.jsx         # Individual column with bead physics
  pages/
    LoginPage.jsx             # Sign in + Register (student/teacher)
    StudentDashboard.jsx      # Student home, stats, score history
    TeacherDashboard.jsx      # Teacher home, student table, AI gen
    PracticeMode.jsx          # Soroban question practice
    DailyChallenge.jsx        # Daily timed challenge
    FreePlay.jsx              # Free Soroban exploration
```
