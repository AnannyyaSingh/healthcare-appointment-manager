# System Design Write-Up: Clinic Care Management

This document details the architectural design and concurrency safety mechanisms implemented in the Healthcare Appointment & Care Manager platform.

---

## 1. Double-Booking Prevention

Preventing double-booking is a critical requirement in medical appointment scheduling. To achieve this, the system combines database transaction scoping with pessimistic writing.

### Concurrency Lock Protocol
In SQLite, concurrent connections are handled safely using stateful transactions. When a patient attempts to book an appointment:
1. The backend initiates a transaction using `BEGIN IMMEDIATE TRANSACTION`. This immediately acquires a write-lock on the SQLite database, preventing other database connections from starting write transactions until the current one is completed (either committed or rolled back).
2. The system checks if an active appointment already exists for the selected `doctor_id`, `appointment_date`, and `appointment_time` where `status = 'booked'`.
3. If a booking exists, the transaction is instantly aborted with a `ROLLBACK` command, returning a `409 Conflict` error to the client.
4. If no booking exists, the new appointment is inserted, emails are queued, and the transaction is finalized with `COMMIT`, releasing the write lock.

Because SQLite processes write-locks serially on the database file, `BEGIN IMMEDIATE` guarantees that no two concurrent requests can evaluate the slot check step simultaneously, ensuring absolute safety from race conditions.

---

## 2. Slot Hold Mechanism

A slot hold mechanism improves the user experience by locking a selected slot for 5 minutes while the patient completes the symptom details. This prevents other patients from stealing the slot mid-entry.

### Architectural Logic
- **Holds Database**: The `slot_holds` table stores temporary locks with fields `doctor_id`, `date`, `time`, `held_by` (patient ID), and `expires_at` (a Unix millisecond timestamp). A database-level `UNIQUE(doctor_id, date, time)` constraint ensures that only one user holds a specific slot at any given moment.
- **Hold Acquisition**: When a patient clicks a slot, the system initiates a transaction. It checks if the slot has an existing hold where `expires_at > CURRENT_TIMESTAMP`. If the hold is either non-existent or has already expired, the system inserts/updates the hold record for the current patient with `expires_at = Date.now() + 5 minutes`.
- **Query Filtering**: When retrieving available slots via `GET /api/patient/doctors/:id/slots`, the system queries both `appointments` and active `slot_holds`. Slots with active holds by other patients are filtered out and returned as `held`. Slots held by the requesting patient are labeled `held_by_me`.
- **Cleanup**: When the booking is successfully confirmed, the hold record is removed in the same transaction. If the patient abandons the page, the hold expires naturally, making the slot available to others.

---

## 3. Doctor Leave Conflict Handling

When an administrator schedules a doctor's leave, any overlapping patient appointments must be handled cleanly.

### Conflict Detection & Resolution Flow
1. **Detection Phase**: When registering a leave date via `POST /api/admin/doctors/:id/leaves`, the system checks for booked appointments for that doctor on that date.
2. **Warning Alert**: If conflicting appointments are found and the request parameter `resolveConflicts` is `false`, the system halts and returns a JSON payload containing the conflict details. The Admin Dashboard catches this and prompts the admin with a warning modal listing affected patient names and times.
3. **Execution Phase**: If the admin approves (`resolveConflicts: true`), the backend runs a transaction that:
   - Updates the status of all conflicting appointments to `cancelled`.
   - Queries Google Calendar and invokes `deleteCalendarEvent` using each appointment's `calendar_event_id`.
   - Generates custom cancellation templates and pushes them into the `email_queue` table.
   - Registers the leave date in the `doctor_leaves` table.

---

## 4. Notification Failure Handling & Resiliency

To prevent slow third-party API calls (e.g., SMTP, SendGrid, or Google Calendar) from slowing down patient booking transactions, and to protect against network drops, the application uses an **outbox pattern** with a transactional queue.

### Outbox Design & Retry Log
- **Asynchronous Execution**: Email dispatches are never sent inline during a user's web request. Instead, email payloads (recipient, subject, HTML body) are written directly to the database in the `email_queue` table as part of the booking transaction.
- **Background Runner**: A background scheduler process wakes up every 30 seconds to fetch up to 10 emails with a status of `pending` or `failed` (where `retry_count < 3`).
- **SMTP Retry Policy**: For each email, the processor attempts delivery. On success, the status is set to `sent`. On failure, the `retry_count` is incremented, and the error details are stored in the database. The email remains in the queue to be retried on the next scheduler run.
- **Graceful Third-Party Fallbacks**: If external API keys (Gemini, Google OAuth, or SMTP) are missing, the system catches these errors, logs descriptive warnings to local files (e.g., `logs/email_log.json`, `logs/calendar_log.json`), and fulfills the user request using rule-based fallbacks.
