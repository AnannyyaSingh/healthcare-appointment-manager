import express from 'express';
import { query, queryOne, run } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { generatePostVisitSummary } from '../services/llm.js';
import { deleteCalendarEvent } from '../services/calendar.js';
import { getCancellationTemplate } from '../services/email.js';

const router = express.Router();

// Apply auth middleware to all doctor routes
router.use(authenticateToken);
router.use(requireRole(['doctor']));

// GET /api/doctor/appointments - Get all appointments booked for the logged-in doctor
router.get('/appointments', async (req, res) => {
  const doctorId = req.user.id;

  try {
    const appointments = await query(
      `SELECT a.*, p.name as patient_name, p.email as patient_email
       FROM appointments a
       JOIN users p ON a.patient_id = p.id
       WHERE a.doctor_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [doctorId]
    );

    // Parse pre-visit summary if it is JSON
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
    console.error('Error fetching doctor appointments:', error);
    res.status(500).json({ error: 'Internal server error fetching appointments' });
  }
});

// POST /api/doctor/appointments/:id/complete - Submit post-visit notes and prescription
router.post('/appointments/:id/complete', async (req, res) => {
  const appointmentId = parseInt(req.params.id);
  const doctorId = req.user.id;
  const { post_visit_notes, prescription, medications } = req.body;
  // medications format: [{ name: "Amoxicillin", frequency: "twice daily" }]

  if (!post_visit_notes) {
    return res.status(400).json({ error: 'Clinical notes are required to complete the visit.' });
  }

  try {
    // 1. Verify appointment belongs to this doctor
    const appt = await queryOne(
      `SELECT a.*, p.name as patient_name, p.email as patient_email
       FROM appointments a
       JOIN users p ON a.patient_id = p.id
       WHERE a.id = ? AND a.doctor_id = ?`,
      [appointmentId, doctorId]
    );

    if (!appt) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appt.status === 'completed') {
      return res.status(400).json({ error: 'Appointment has already been completed.' });
    }

    // 2. Generate LLM post-visit summary
    let aiPostSummary = '';
    try {
      aiPostSummary = await generatePostVisitSummary(post_visit_notes);
    } catch (llmErr) {
      console.error('LLM Post-Visit generation failed (graceful):', llmErr.message);
      aiPostSummary = `Clinical notes summarized: ${post_visit_notes}. Refer to clinical guidelines for care.`;
    }

    // Begin transaction to finalize appointment and set up reminders
    await run('BEGIN IMMEDIATE TRANSACTION');

    // 3. Update appointment record
    await run(
      `UPDATE appointments SET 
        status = 'completed', 
        post_visit_notes = ?, 
        prescription = ?, 
        post_visit_summary = ? 
       WHERE id = ?`,
      [post_visit_notes, prescription || '', aiPostSummary, appointmentId]
    );

    // 4. Create medication reminders if provided
    if (Array.isArray(medications) && medications.length > 0) {
      // First reminder runs in 1 hour
      const firstRun = new Date();
      firstRun.setHours(firstRun.getHours() + 1);
      const firstRunStr = firstRun.toLocaleString('sv').replace(',', '').substring(0, 16); // "YYYY-MM-DD HH:MM"

      for (const med of medications) {
        if (med.name && med.frequency) {
          await run(
            `INSERT INTO reminders (appointment_id, medication_name, frequency, next_run_at, status)
             VALUES (?, ?, ?, ?, 'active')`,
            [appointmentId, med.name, med.frequency, firstRunStr]
          );
        }
      }
    }

    // Queue post-visit summary email to patient
    const emailSubject = `Your Post-Visit Summary & Care Plan`;
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #4f46e5;">Post-Visit Health Summary</h2>
        <p>Dear ${appt.patient_name},</p>
        <p>Your consultation today with Dr. ${req.user.name} is complete. Below is your personalized post-visit summary and next steps:</p>
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #4f46e5;">
          ${aiPostSummary.replace(/\n/g, '<br>')}
        </div>

        ${prescription ? `
        <div style="background-color: #eff6ff; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <strong>Prescribed Medications:</strong><br>
          ${prescription.replace(/\n/g, '<br>')}
        </div>
        ` : ''}

        <p>If you have further questions or if your symptoms worsen, please contact the clinic.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280;">This is an automated system email. Please do not reply.</p>
      </div>
    `;

    await run(
      `INSERT INTO email_queue (to_email, subject, body, status) VALUES (?, ?, ?, ?)`,
      [appt.patient_email, emailSubject, emailHtml, 'pending']
    );

    await run('COMMIT');

    res.status(200).json({
      message: 'Appointment completed and summary generated.',
      post_visit_summary: aiPostSummary
    });

  } catch (error) {
    await run('ROLLBACK');
    console.error('Error completing appointment:', error);
    res.status(500).json({ error: 'Internal server error completing appointment.' });
  }
});

// PUT /api/doctor/appointments/:id/cancel - Cancel booking
router.put('/appointments/:id/cancel', async (req, res) => {
  const appointmentId = parseInt(req.params.id);
  const doctorId = req.user.id;

  let inTransaction = false;
  try {
    const appt = await queryOne(
      `SELECT a.*, d.name as doctor_name, d.email as doctor_email, p.name as patient_name, p.email as patient_email
       FROM appointments a
       JOIN users d ON a.doctor_id = d.id
       JOIN users p ON a.patient_id = p.id
       WHERE a.id = ? AND a.doctor_id = ?`,
      [appointmentId, doctorId]
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
      'Cancelled by the doctor due to scheduling urgency.'
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
      'Cancelled by you (the doctor).'
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
