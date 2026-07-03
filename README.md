# Healthcare Appointment & Care Manager

This is a comprehensive, production-ready healthcare management application built with a Node.js/Express backend, an SQLite database, and a React (Vite) frontend. It includes portals for Admins, Doctors, and Patients, automated medication reminders, calendar syncing, and LLM-powered visit summaries.

---

## Table of Contents
1. [Setup Guide](#setup-guide)
2. [Database Schema](#database-schema)
3. [API Documentation](#api-documentation)
4. [LLM Integration & Prompts](#llm-integration--prompts)
5. [Google Calendar OAuth 2.0 Setup](#google-calendar-oauth-20-setup)
6. [Design & Architecture Overview](#design--architecture-overview)

---

## Setup Guide

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **NPM** (v9 or higher)

### Installation
1. Clone or extract the project zip file.
2. Open a terminal in the root directory `healthcare-manager` and install all workspace dependencies:
   ```bash
   # Installs concurrently in root, and runs sub-installations in backend/ and frontend/
   npm install
   npm run install:all
   ```

### Configuration
1. Navigate to the `backend/` directory and create a `.env` file based on `.env.example`:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Configure your environment keys:
   - **GEMINI_API_KEY**: Get a free API key from [Google AI Studio](https://aistudio.google.com/). If left blank, the system automatically falls back to local rule-based summary generation.
   - **SMTP_HOST / USER / PASS**: Email SMTP parameters. If left blank, all sent emails will log as clean JSON entries inside `backend/logs/email_log.json` rather than failing.
   - **GOOGLE_CLIENT_ID / SECRET / REFRESH_TOKEN**: For Google Calendar integrations. If left blank, all events will mock-log to `backend/logs/calendar_log.json`.

### Seed and Run
1. Run the database seed script to initialize default credentials:
   ```bash
   npm run seed --prefix backend
   ```
2. Start both the backend and frontend development servers concurrently:
   ```bash
   npm run dev
   ```
3. Default Test Login Portals:
   - **Admin Portal**: `admin@clinic.com` / `admin123`
   - **Doctor Portal**: `doctor1@clinic.com` / `doctor123`
   - **Patient Portal**: `patient@example.com` / `patient123`
   - **Frontend App**: Spawns at `http://localhost:5173/`
   - **Backend API**: Spawns at `http://localhost:5000/`

---

## Database Schema

The database uses SQLite, containing 7 integrated tables:

```sql
-- 1. Users list (role-based auth)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('patient', 'doctor', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 2. Doctor profile specifications
CREATE TABLE doctor_profiles (
  id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specialisation TEXT NOT NULL,
  slot_duration INTEGER NOT NULL DEFAULT 30,
  working_start TEXT NOT NULL DEFAULT '09:00',
  working_end TEXT NOT NULL DEFAULT '17:00'
);

-- 3. Doctor leave days
CREATE TABLE doctor_leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  leave_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(doctor_id, leave_date)
);

-- 4. Booked and completed appointments
CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('booked', 'cancelled', 'completed')) DEFAULT 'booked',
  symptoms TEXT,
  urgency_level TEXT CHECK(urgency_level IN ('Low', 'Medium', 'High')),
  pre_visit_summary TEXT, -- JSON String: chief complaint, suggested questions, raw summary
  post_visit_notes TEXT,
  prescription TEXT,
  post_visit_summary TEXT, -- Patient-friendly AI Care plan
  calendar_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 5. Active temporary slot holds (5 minutes limit)
CREATE TABLE slot_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  held_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(doctor_id, date, time)
);

-- 6. Email Queue for background delivery and retry logs
CREATE TABLE email_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'failed', 'sent')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 7. Recurring medication reminders
CREATE TABLE reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  frequency TEXT NOT NULL,
  next_run_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'sent', 'cancelled'))
);
```

---

## API Documentation

### Auth Portal
- `POST /api/auth/register` : Public register (role: `patient` or `doctor`).
- `POST /api/auth/login` : Login user, returns JWT and user metadata.
- `GET /api/auth/me` : Validate token and fetch profile.

### Patient Portal
- `GET /api/patient/doctors` : List doctors. Accepts `specialisation` and `search` filters.
- `GET /api/patient/doctors/:id/slots?date=YYYY-MM-DD` : List slots, labeled as `available`, `booked`, `held`, or `held_by_me`.
- `POST /api/patient/slots/hold` : Request a 5-minute hold on a slot.
- `POST /api/patient/appointments` : Confirm booking. Submits symptoms, generates LLM summaries, creates calendar event, logs confirmation emails.
- `GET /api/patient/appointments` : List all logged patient appointments and prescriptions.

### Doctor Portal
- `GET /api/doctor/appointments` : Retrieve scheduled doctor appointments, including symptoms and AI pre-visit summaries.
- `POST /api/doctor/appointments/:id/complete` : Log clinical notes, issue prescriptions, initialize medication reminders, generate AI care plans.

### Admin Portal
- `GET /api/admin/doctors` : Retrieve all registered doctors, hours, and leaves.
- `POST /api/admin/doctors` : Register a doctor.
- `PUT /api/admin/doctors/:id` : Update working hours, slot duration, specialisation.
- `DELETE /api/admin/doctors/:id` : Remove doctor, cancel future appointments, queue alert notices.
- `POST /api/admin/doctors/:id/leaves` : Register leave. Detects booking overlaps. Pass `resolveConflicts: true` to auto-cancel bookings and dispatch alert emails.
- `DELETE /api/admin/doctors/:id/leaves/:date` : Remove a scheduled leave.

---

## LLM Integration & Prompts

The system utilizes Gemini API for two critical tasks, using structured parsing to isolate JSON outputs:

### 1. Pre-visit Symptoms Summary
- **Prompt**:
  `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>`
- **Structured Schema Requested**:
  ```json
  {
    "urgency_level": "Low" | "Medium" | "High",
    "chief_complaint": "Brief chief complaint text",
    "suggested_questions": ["Question 1", "Question 2", "Question 3"],
    "raw_summary": "Full overview text"
  }
  ```

### 2. Post-visit Patient Plan
- **Prompt**:
  `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>`

---

## Google Calendar OAuth 2.0 Setup

Follow these steps to generate production Google Calendar credentials:

1. **Create Google Cloud Project**:
   Go to the [Google Cloud Console](https://console.cloud.google.com/), log in, and create a new project.
2. **Enable Calendar API**:
   Search for "Google Calendar API" in the library search bar, and click **Enable**.
3. **Configure OAuth Consent Screen**:
   - Navigate to **APIs & Services > OAuth consent screen**.
   - Select **External** type, register your application details, and add your test email as a developer.
   - Under scopes, add `.../auth/calendar` and `.../auth/calendar.events`.
4. **Generate Credentials**:
   - Navigate to **APIs & Services > Credentials**.
   - Click **Create Credentials > OAuth client ID**.
   - Select **Web Application** type.
   - Set **Authorized Redirect URIs** to: `http://localhost:5000/api/auth/google/callback` (or your staging domain).
   - Copy the generated `Client ID` and `Client Secret` to your `.env` file.
5. **Acquire Refresh Token**:
   Since the app runs as a service backend, you need a long-lived `Refresh Token` to query calendars without user-facing logins. You can obtain this using Google OAuth playground or by exposing a temporary auth route:
   - Navigate to Google OAuth Playground, authorize the Calendar scopes, select your client ID/secret, click authorize, and copy the generated `Refresh Token` to your `.env` file.
