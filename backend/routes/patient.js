import express from 'express';
import { query, queryOne, run } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { generatePreVisitSummary } from '../services/llm.js';
import { createCalendarEvent, deleteCalendarEvent } from '../services/calendar.js';
import { getBookingConfirmationTemplate, getCancellationTemplate } from '../services/email.js';

const router = express.Router();

// Apply auth middleware to all patient routes
router.use(authenticateToken);
router.use(requireRole(['patient']));

// Helper to convert time HH:MM to minutes from midnight
const timeToMinutes = (timeStr) => {
  const [hrs, mins] = timeStr.split(':').map(Number);
  return hrs * 60 + mins;
};

// Helper to convert minutes to HH:MM
const minutesToTime = (totalMins) => {
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

// GET /api/patient/doctors - Search/filter doctors by specialisation or name
router.get('/doctors', async (req, res) => {
  const { specialisation, search } = req.query;
  
  let sql = `
    SELECT u.id, u.name, u.email, dp.specialisation, dp.slot_duration, dp.working_start, dp.working_end
    FROM users u
    JOIN doctor_profiles dp ON u.id = dp.id
    WHERE u.role = 'doctor'
  `;
  const params = [];

  if (specialisation) {
    sql += ` AND dp.specialisation LIKE ?`;
    params.push(`%${specialisation}%`);
  }
  if (search) {
    sql += ` AND (u.name LIKE ? OR dp.specialisation LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  try {
    const doctors = await query(sql, params);
    res.status(200).json(doctors);
  } catch (error) {
    console.error('Error searching doctors:', error);
    res.status(500).json({ error: 'Internal server error searching doctors' });
  }
});

// GET /api/patient/doctors/:id/slots - Get available slots for a date
router.get('/doctors/:id/slots', async (req, res) => {
  const doctorId = parseInt(req.params.id);
  const { date } = req.query; // YYYY-MM-DD

  if (!date) {
    return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
  }

  try {
    // 1. Get Doctor Profile
    const profile = await queryOne(
      `SELECT u.name, dp.slot_duration, dp.working_start, dp.working_end 
       FROM users u
       JOIN doctor_profiles dp ON u.id = dp.id
       WHERE u.id = ? AND u.role = 'doctor'`,
      [doctorId]
    );

    if (!profile) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // 2. Check if Doctor is on leave on this date
    const leave = await queryOne(
      `SELECT id FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ?`,
      [doctorId, date]
    );
    if (leave) {
      return res.status(200).json({ slots: [], message: 'Doctor is on leave on this date.' });
    }

    // 3. Generate all slots based on working hours and duration
    const startMins = timeToMinutes(profile.working_start);
    const endMins = timeToMinutes(profile.working_end);
    const duration = profile.slot_duration;
    
    const allSlots = [];
    for (let time = startMins; time + duration <= endMins; time += duration) {
      allSlots.push(minutesToTime(time));
    }

    // 4. Get active bookings for this date
    const bookings = await query(
      `SELECT appointment_time FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status = 'booked'`,
      [doctorId, date]
    );
    const bookedTimes = new Set(bookings.map(b => b.appointment_time));

    // 5. Get active slot holds for this date
    const nowMs = Date.now();
    const holds = await query(
      `SELECT time, held_by FROM slot_holds WHERE doctor_id = ? AND date = ? AND expires_at > ?`,
      [doctorId, date, nowMs]
    );
    
    const heldSlotsMap = {};
    holds.forEach(h => {
      heldSlotsMap[h.time] = h.held_by;
    });

    // 6. Filter available slots
    const availableSlots = allSlots.map(time => {
      const isBooked = bookedTimes.has(time);
      const heldByUserId = heldSlotsMap[time] || null;
      const isHeldBySomeoneElse = heldByUserId && heldByUserId !== req.user.id;
      const isHeldByMe = heldByUserId && heldByUserId === req.user.id;

      return {
        time,
        status: isBooked 
          ? 'booked' 
          : isHeldBySomeoneElse 
            ? 'held' 
            : isHeldByMe 
              ? 'held_by_me' 
              : 'available',
      };
    });

    res.status(200).json({ slots: availableSlots });
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ error: 'Internal server error fetching slots' });
  }
});

// POST /api/patient/slots/hold - Hold a slot for 5 minutes
router.post('/slots/hold', async (req, res) => {
  const { doctor_id, date, time } = req.body;
  const patientId = req.user.id;

  if (!doctor_id || !date || !time) {
    return res.status(400).json({ error: 'doctor_id, date, and time are required' });
  }

  let inTransaction = false;
  try {
    // We run a transaction-like procedure using SQLite BEGIN IMMEDIATE to ensure safety
    await run('BEGIN IMMEDIATE TRANSACTION');
    inTransaction = true;

    // 1. Check if already booked
    const booked = await queryOne(
      `SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status = 'booked'`,
      [doctor_id, date, time]
    );
    if (booked) {
      await run('ROLLBACK');
      inTransaction = false;
      return res.status(409).json({ error: 'This slot is already booked.' });
    }

    // 2. Check if on leave
    const leave = await queryOne(
      `SELECT id FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ?`,
      [doctor_id, date]
    );
    if (leave) {
      await run('ROLLBACK');
      inTransaction = false;
      return res.status(400).json({ error: 'Doctor is on leave on this date.' });
    }

    // 3. Check if held by someone else
    const nowMs = Date.now();
    const existingHold = await queryOne(
      `SELECT id, held_by, expires_at FROM slot_holds WHERE doctor_id = ? AND date = ? AND time = ?`,
      [doctor_id, date, time]
    );

    if (existingHold && existingHold.expires_at > nowMs && existingHold.held_by !== patientId) {
      await run('ROLLBACK');
      inTransaction = false;
      return res.status(409).json({ error: 'This slot is currently held by another patient.' });
    }

    // 4. Create or update hold
    const expiry = nowMs + (5 * 60 * 1000); // 5 minutes hold
    
    if (existingHold) {
      await run(
        `UPDATE slot_holds SET held_by = ?, expires_at = ?, created_at = datetime('now', 'localtime') WHERE id = ?`,
        [patientId, expiry, existingHold.id]
      );
    } else {
      await run(
        `INSERT INTO slot_holds (doctor_id, date, time, held_by, expires_at) VALUES (?, ?, ?, ?, ?)`,
        [doctor_id, date, time, patientId, expiry]
      );
    }

    await run('COMMIT');
    inTransaction = false;
    res.status(200).json({
      message: 'Slot hold acquired successfully.',
      expires_at: expiry
    });
  } catch (error) {
    if (inTransaction) {
      try {
        await run('ROLLBACK');
      } catch (e) {}
    }
    console.error('Error holding slot:', error);
    res.status(500).json({ error: 'Internal server error holding slot' });
  }
});

// POST /api/patient/appointments - Confirm booking and submit symptoms
router.post('/appointments', async (req, res) => {
  const { doctor_id, date, time, symptoms } = req.body;
  const patientId = req.user.id;

  if (!doctor_id || !date || !time) {
    return res.status(400).json({ error: 'doctor_id, date, and time are required' });
  }

  let inTransaction = false;
  try {
    // 1. Double Booking Check & Transaction lock
    await run('BEGIN IMMEDIATE TRANSACTION');
    inTransaction = true;

    const doctor = await queryOne(`SELECT name, email FROM users WHERE id = ? AND role = 'doctor'`, [doctor_id]);
    const patient = await queryOne(`SELECT name, email FROM users WHERE id = ?`, [patientId]);
    const profile = await queryOne(`SELECT slot_duration FROM doctor_profiles WHERE id = ?`, [doctor_id]);

    if (!doctor || !patient || !profile) {
      await run('ROLLBACK');
      inTransaction = false;
      return res.status(404).json({ error: 'Doctor or patient profile not found' });
    }

    // Verify doctor is not on leave
    const leave = await queryOne(
      `SELECT id FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ?`,
      [doctor_id, date]
    );
    if (leave) {
      await run('ROLLBACK');
      inTransaction = false;
      return res.status(400).json({ error: 'Doctor is on leave on this date.' });
    }

    // Verify slot is not already booked
    const booked = await queryOne(
      `SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status = 'booked'`,
      [doctor_id, date, time]
    );
    if (booked) {
      await run('ROLLBACK');
      inTransaction = false;
      return res.status(409).json({ error: 'This slot is already booked.' });
    }

    // Check if slot hold exists for this patient (not strictly required but we prefer it)
    const hold = await queryOne(
      `SELECT id FROM slot_holds WHERE doctor_id = ? AND date = ? AND time = ? AND held_by = ?`,
      [doctor_id, date, time, patientId]
    );

    // Call LLM generator for pre-visit summary
    let aiSummary = {
      urgency_level: 'Low',
      chief_complaint: 'Routine Check',
      suggested_questions: [],
      raw_summary: 'None'
    };

    try {
      aiSummary = await generatePreVisitSummary(symptoms);
    } catch (llmErr) {
      console.error('LLM Pre-Visit execution failed (graceful):', llmErr.message);
    }

    // Calculate appointment end time for Google Calendar
    const startDateTimeStr = `${date}T${time}:00`;
    const startMins = timeToMinutes(time);
    const endMins = startMins + profile.slot_duration;
    const endDateTimeStr = `${date}T${minutesToTime(endMins)}:00`;

    // Google Calendar API integration
    let calEventId = null;
    try {
      calEventId = await createCalendarEvent({
        summary: `Appointment: ${patient.name} & Dr. ${doctor.name}`,
        description: `Patient symptoms: ${symptoms || 'None'}\n\nChief Complaint (AI summary): ${aiSummary.chief_complaint}\nUrgency: ${aiSummary.urgency_level}\n\nSuggested doctor questions:\n- ${aiSummary.suggested_questions.join('\n- ')}`,
        startDateTime: startDateTimeStr,
        endDateTime: endDateTimeStr,
        attendeeEmails: [patient.email, doctor.email]
      });
    } catch (calErr) {
      console.error('Google Calendar event creation failed (graceful):', calErr.message);
    }

    // Create appointment in database
    const apptRes = await run(
      `INSERT INTO appointments (
        patient_id, doctor_id, appointment_date, appointment_time, status, 
        symptoms, urgency_level, pre_visit_summary, calendar_event_id
      ) VALUES (?, ?, ?, ?, 'booked', ?, ?, ?, ?)`,
      [
        patientId, 
        doctor_id, 
        date, 
        time, 
        symptoms, 
        aiSummary.urgency_level, 
        JSON.stringify({
          chief_complaint: aiSummary.chief_complaint,
          suggested_questions: aiSummary.suggested_questions,
          summary: aiSummary.raw_summary
        }),
        calEventId
      ]
    );

    // Delete slot hold since booking is complete
    if (hold) {
      await run(`DELETE FROM slot_holds WHERE id = ?`, [hold.id]);
    }

    // Insert Confirmation emails into Queue (both Patient and Doctor)
    const patientMailTemplate = getBookingConfirmationTemplate(patient.name, doctor.name, date, time);
    await run(
      `INSERT INTO email_queue (to_email, subject, body, status) VALUES (?, ?, ?, ?)`,
      [patient.email, patientMailTemplate.subject, patientMailTemplate.html, 'pending']
    );

    const docMailTemplate = getBookingConfirmationTemplate(doctor.name, patient.name, date, time);
    await run(
      `INSERT INTO email_queue (to_email, subject, body, status) VALUES (?, ?, ?, ?)`,
      [doctor.email, `New Appointment Booked: ${patient.name} - ${date}`, docMailTemplate.html, 'pending']
    );

    await run('COMMIT');
    inTransaction = false;

    res.status(201).json({
      message: 'Appointment booked successfully.',
      appointment: {
        id: apptRes.id,
        doctor_name: doctor.name,
        date,
        time,
        urgency_level: aiSummary.urgency_level,
        pre_visit_summary: aiSummary.chief_complaint,
      }
    });

  } catch (error) {
    if (inTransaction) {
      try {
        await run('ROLLBACK');
      } catch (e) {}
    }
    console.error('Error booking appointment:', error);
    res.status(500).json({ error: 'Internal server error booking appointment.' });
  }
});

// GET /api/patient/appointments - Get appointments for the logged-in patient
router.get('/appointments', async (req, res) => {
  const patientId = req.user.id;

  try {
    const appointments = await query(
      `SELECT a.*, d.name as doctor_name, dp.specialisation as doctor_specialisation
       FROM appointments a
       JOIN users d ON a.doctor_id = d.id
       JOIN doctor_profiles dp ON d.id = dp.id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [patientId]
    );

    // Parse pre-visit summary if it is saved as JSON
    const parsedAppointments = appointments.map(appt => {
      let preVisit = null;
      if (appt.pre_visit_summary) {
        try {
          preVisit = JSON.parse(appt.pre_visit_summary);
        } catch {
          preVisit = appt.pre_visit_summary;
        }
      }
      return { ...appt, pre_visit_summary: preVisit };
    });

    res.status(200).json(parsedAppointments);
  } catch (error) {
    console.error('Error fetching patient appointments:', error);
    res.status(500).json({ error: 'Internal server error fetching appointments' });
  }
});

// PUT /api/patient/appointments/:id/cancel - Cancel booking
router.put('/appointments/:id/cancel', async (req, res) => {
  const appointmentId = parseInt(req.params.id);
  const patientId = req.user.id;

  let inTransaction = false;
  try {
    const appt = await queryOne(
      `SELECT a.*, d.name as doctor_name, d.email as doctor_email, p.name as patient_name, p.email as patient_email
       FROM appointments a
       JOIN users d ON a.doctor_id = d.id
       JOIN users p ON a.patient_id = p.id
       WHERE a.id = ? AND a.patient_id = ?`,
      [appointmentId, patientId]
    );

    if (!appt) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appt.status !== 'booked') {
      return res.status(400).json({ error: `Cannot cancel appointment with status: ${appt.status}` });
    }

    // Begin transaction
    await run('BEGIN IMMEDIATE TRANSACTION');
    inTransaction = true;

    // Update appointment status to cancelled
    await run(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [appointmentId]);

    // Remove Google Calendar Event
    if (appt.calendar_event_id) {
      try {
        await deleteCalendarEvent(appt.calendar_event_id);
      } catch (err) {
        console.error('Failed to delete Google Calendar Event (graceful):', err.message);
      }
    }

    // Cancel medication reminders if any
    await run(`UPDATE reminders SET status = 'cancelled' WHERE appointment_id = ?`, [appointmentId]);

    // Send emails
    const emailTemplate = getCancellationTemplate(
      appt.patient_name,
      appt.doctor_name,
      appt.appointment_date,
      appt.appointment_time,
      'Cancelled by the patient.'
    );

    // Queue cancellation email for Patient
    await run(
      `INSERT INTO email_queue (to_email, subject, body, status) VALUES (?, ?, ?, ?)`,
      [appt.patient_email, emailTemplate.subject, emailTemplate.html, 'pending']
    );

    // Queue cancellation email for Doctor
    const docEmailTemplate = getCancellationTemplate(
      appt.doctor_name,
      appt.patient_name,
      appt.appointment_date,
      appt.appointment_time,
      `Cancelled by the patient ${appt.patient_name}.`
    );
    await run(
      `INSERT INTO email_queue (to_email, subject, body, status) VALUES (?, ?, ?, ?)`,
      [appt.doctor_email, `Appointment Cancelled: ${appt.patient_name} - ${appt.appointment_date}`, docEmailTemplate.html, 'pending']
    );

    await run('COMMIT');
    inTransaction = false;

    res.status(200).json({ message: 'Appointment cancelled successfully.' });
  } catch (error) {
    if (inTransaction) {
      try {
        await run('ROLLBACK');
      } catch (e) {}
    }
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ error: 'Internal server error cancelling appointment.' });
  }
});

export default router;
