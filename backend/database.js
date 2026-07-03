import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'healthcare.db');
const db = new sqlite3.Database(dbPath);
db.configure("busyTimeout", 10000); // 10 seconds timeout for concurrency lock queue

// Promise-based wrappers
export const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const queryOne = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Initialize schema
export const initDB = async () => {
  // Create tables
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('patient', 'doctor', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS doctor_profiles (
      id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      specialisation TEXT NOT NULL,
      slot_duration INTEGER NOT NULL DEFAULT 30,
      working_start TEXT NOT NULL DEFAULT '09:00',
      working_end TEXT NOT NULL DEFAULT '17:00'
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS doctor_leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      leave_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(doctor_id, leave_date)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('booked', 'cancelled', 'completed')) DEFAULT 'booked',
      symptoms TEXT,
      urgency_level TEXT CHECK(urgency_level IN ('Low', 'Medium', 'High')),
      pre_visit_summary TEXT,
      post_visit_notes TEXT,
      prescription TEXT,
      post_visit_summary TEXT,
      calendar_event_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS slot_holds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      held_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(doctor_id, date, time)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'failed', 'sent')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
      medication_name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      next_run_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'sent', 'cancelled'))
    )
  `);

  console.log('Database tables initialized successfully.');
};

// Seed default accounts
export const seedDB = async () => {
  await initDB();

  // Check if admin exists
  const adminExists = await queryOne(`SELECT id FROM users WHERE email = ?`, ['admin@clinic.com']);
  if (!adminExists) {
    const adminHash = await bcrypt.hash('admin123', 10);
    await run(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      ['Clinic Admin', 'admin@clinic.com', adminHash, 'admin']
    );
    console.log('Admin user seeded: admin@clinic.com / admin123');
  }

  // Seed default Doctors
  const docEmails = ['doctor1@clinic.com', 'doctor2@clinic.com'];
  const docNames = ['Dr. Alice Smith', 'Dr. Bob Johnson'];
  const docSpecs = ['Cardiology', 'Pediatrics'];

  for (let i = 0; i < docEmails.length; i++) {
    const email = docEmails[i];
    const docExists = await queryOne(`SELECT id FROM users WHERE email = ?`, [email]);
    if (!docExists) {
      const docHash = await bcrypt.hash('doctor123', 10);
      const res = await run(
        `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
        [docNames[i], email, docHash, 'doctor']
      );
      await run(
        `INSERT INTO doctor_profiles (id, specialisation, slot_duration, working_start, working_end) VALUES (?, ?, ?, ?, ?)`,
        [res.id, docSpecs[i], 30, '09:00', '17:00']
      );
      console.log(`Doctor seeded: ${email} / doctor123 (${docSpecs[i]})`);
    }
  }

  // Seed default Patient
  const patientEmail = 'patient@example.com';
  const patientExists = await queryOne(`SELECT id FROM users WHERE email = ?`, [patientEmail]);
  if (!patientExists) {
    const patientHash = await bcrypt.hash('patient123', 10);
    await run(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      ['John Doe', patientEmail, patientHash, 'patient']
    );
    console.log('Patient seeded: patient@example.com / patient123');
  }
};

// Check if running directly to seed
if (process.argv.includes('--seed')) {
  seedDB().then(() => {
    console.log('Seeding completed.');
    process.exit(0);
  }).catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}
