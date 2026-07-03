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
# 🏥 Healthcare Appointment & Follow-up Manager

> An AI-powered healthcare appointment management platform that streamlines appointment booking, doctor scheduling, AI-assisted symptom analysis, post-visit summaries, medication reminders, email notifications, and Google Calendar integration.

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Backend-Node.js-green)
![React](https://img.shields.io/badge/Frontend-React-61DAFB)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248)
![OpenAI](https://img.shields.io/badge/AI-LLM-orange)

---

The platform simplifies appointment scheduling while leveraging Large Language Models (LLMs) to generate AI-powered symptom summaries before consultations and patient-friendly visit summaries afterward. It also automates medication reminders, email notifications, and Google Calendar synchronization.

---

# ✨ Features

## 👨‍⚕️ Admin Portal

- Create, edit, and remove doctor profiles
- Manage doctor specializations
- Configure working hours
- Configure slot duration
- Mark doctor leave dates
- Automatically notify affected patients
- Dashboard with appointment analytics

---

## 🩺 Doctor Portal

- Secure authentication
- View daily appointments
- Read AI-generated symptom summaries
- Access patient history
- Submit consultation notes
- Upload prescriptions
- Generate AI-powered patient summaries
- Manage availability

---

## 👤 Patient Portal

- User Registration & Login
- Search doctors by specialization
- View available appointment slots
- Book appointments
- Fill symptom questionnaire
- View appointment history
- Receive reminders
- Access post-visit summaries


### Post-Visit Summary

Doctors submit clinical notes.

The AI converts them into patient-friendly language including:

- Diagnosis
- Medication Schedule
- Lifestyle Advice
- Follow-up Instructions

---

## 📧 Email Notifications

Automatic emails for

- Appointment Confirmation
- Appointment Cancellation
- Appointment Reminder
- Medication Reminder
- Doctor Leave Notification

Built using **Nodemailer SMTP**.

---

## 📅 Google Calendar Integration

Automatically:

- Create appointment events
- Update events on reschedule
- Delete events on cancellation
- Invite both doctor and patient

---

## 🔒 Authentication

Role-Based Authentication

- Patient
- Doctor
- Admin

JWT Authentication

Password Hashing using bcrypt

Protected Routes

---

## ⚡ Double Booking Prevention

The system prevents multiple patients from booking the same slot by:

- Database Transactions
- Atomic Updates
- Slot Lock Mechanism
- Appointment Status Validation

---

## 🔄 Background Jobs

Automated background workers handle:

- Medication reminders
- Appointment reminders
- Email retries
- Calendar synchronization

---

# 🛠 Tech Stack

## Frontend

- React.js
- Tailwind CSS
- Axios
- React Router

---

## Backend

- Node.js
- Express.js
- JWT Authentication
- Nodemailer
- Google Calendar API
- OpenAI API

---

## Database

- MongoDB
- Mongoose

---

# 📂 Project Structure

```
Healthcare-Appointment-Manager
│
├── backend
│   ├── config
│   ├── controllers
│   ├── middleware
│   ├── models
│   ├── routes
│   ├── services
│   ├── jobs
│   ├── utils
│   └── server.js
│
├── frontend
│   ├── public
│   ├── src
│   │   ├── pages
│   │   ├── components
│   │   ├── context
│   │   ├── services
│   │   └── App.jsx
│
└── README.md
```

---

# 🗄 Database Schema

### User

- Name
- Email
- Password
- Role

---

### Doctor

- Specialization
- Experience
- Working Hours
- Slot Duration
- Leave Dates

---

### Appointment

- Patient
- Doctor
- Date
- Time
- Symptoms
- AI Summary
- Status

---

### Prescription

- Medicines
- Dosage
- Frequency
- Notes

# 📖 System Design Highlights

✅ Role-Based Authentication

✅ AI-assisted Healthcare Workflow

✅ Atomic Appointment Booking

✅ Doctor Leave Conflict Resolution

✅ Queue-based Notification System

✅ Email Retry Mechanism

✅ Google Calendar Synchronization

✅ Background Job Scheduling

---

# 👨‍💻 Author

**Anannya Singh**

Computer Science Engineering Student

Python • C++ • JavaScript • React • Node.js • AI • Machine Learning

LinkedIn: https://www.linkedin.com/in/anannya-singh-5aa6b1337/

GitHub: https://github.com/AnannyyaSingh

---

# ⭐ If you found this project useful

Please consider giving it a **⭐ Star**.
