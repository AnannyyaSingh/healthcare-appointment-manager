import express from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne, run } from '../database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { deleteCalendarEvent } from '../services/calendar.js';
import { getCancellationTemplate } from '../services/email.js';

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(authenticateToken);
router.use(requireRole(['admin']));

// GET /api/admin/doctors - Get all doctors with their profile details
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await query(`
      SELECT u.id, u.name, u.email, dp.specialisation, dp.slot_duration, dp.working_start, dp.working_end
      FROM users u
      LEFT JOIN doctor_profiles dp ON u.id = dp.id
      WHERE u.role = 'doctor'
    `);
    
    // For each doctor, load their leave dates
    for (let doc of doctors) {
      const leaves = await query(`SELECT leave_date FROM doctor_leaves WHERE doctor_id = ?`, [doc.id]);
      doc.leaves = leaves.map(l => l.leave_date);
    }

    res.status(200).json(doctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ error: 'Internal server error fetching doctors' });
  }
});

// POST /api/admin/doctors - Create a new doctor profile
router.post('/doctors', async (req, res) => {
  const { name, email, password, specialisation, slot_duration, working_start, working_end } = req.body;

  if (!name || !email || !password || !specialisation) {
    return res.status(400).json({ error: 'Name, email, password and specialisation are required' });
  }

  try {
    const existingUser = await queryOne(`SELECT id FROM users WHERE email = ?`, [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const userRes = await run(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'doctor')`,
      [name, email, hash]
    );

    const docId = userRes.id;
    await run(
      `INSERT INTO doctor_profiles (id, specialisation, slot_duration, working_start, working_end) VALUES (?, ?, ?, ?, ?)`,
      [
        docId, 
        specialisation, 
        slot_duration || 30, 
        working_start || '09:00', 
        working_end || '17:00'
      ]
    );

    res.status(201).json({
      message: 'Doctor profile created successfully',
      doctor: { id: docId, name, email, specialisation, slot_duration, working_start, working_end }
    });
  } catch (error) {
    console.error('Error creating doctor profile:', error);
    res.status(500).json({ error: 'Internal server error creating doctor profile' });
  }
});

// PUT /api/admin/doctors/:id - Update doctor profile
router.put('/doctors/:id', async (req, res) => {
  const doctorId = parseInt(req.params.id);
  const { name, email, specialisation, slot_duration, working_start, working_end } = req.body;

  try {
    const doctorExists = await queryOne(`SELECT id FROM users WHERE id = ? AND role = 'doctor'`, [doctorId]);
    if (!doctorExists) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    if (name || email) {
      await run(
        `UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ?`,
        [name, email, doctorId]
      );
    }

    await run(
      `UPDATE doctor_profiles SET 
        specialisation = COALESCE(?, specialisation), 
        slot_duration = COALESCE(?, slot_duration), 
        working_start = COALESCE(?, working_start), 
        working_end = COALESCE(?, working_end) 
       WHERE id = ?`,
      [specialisation, slot_duration, working_start, working_end, doctorId]
    );

    res.status(200).json({ message: 'Doctor profile updated successfully' });
  } catch (error) {
    console.error('Error updating doctor profile:', error);
    res.status(500).json({ error: 'Internal server error updating doctor' });
  }
});

// DELETE /api/admin/doctors/:id - Delete doctor and profile
router.delete('/doctors/:id', async (req, res) => {
  const doctorId = parseInt(req.params.id);
  try {
    const doctorExists = await queryOne(`SELECT id FROM users WHERE id = ? AND role = 'doctor'`, [doctorId]);
    if (!doctorExists) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Cancel all future active appointments of this doctor
    const activeAppointments = await query(
      `SELECT a.*, p.name as patient_name, p.email as patient_email, d.name as doctor_name
       FROM appointments a
       JOIN users p ON a.patient_id = p.id
       JOIN users d ON a.doctor_id = d.id
       WHERE a.doctor_id = ? AND a.status = 'booked'`,
      [doctorId]
    );

    for (const appt of activeAppointments) {
      await run(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [appt.id]);
      if (appt.calendar_event_id) {
        await deleteCalendarEvent(appt.calendar_event_id);
      }
      
      const emailTemplate = getCancellationTemplate(
        appt.patient_name,
        appt.doctor_name,
        appt.appointment_date,
        appt.appointment_time,
        `Dr. ${appt.doctor_name} has left the clinic practice.`
      );

      await run(
        `INSERT INTO email_queue (to_email, subject, body, status) VALUES (?, ?, ?, ?)`,
        [appt.patient_email, emailTemplate.subject, emailTemplate.html, 'pending']
      );
    }

    // Delete user (cascade will handle profiles, leaves, etc.)
    await run(`DELETE FROM users WHERE id = ?`, [doctorId]);

    res.status(200).json({ message: 'Doctor deleted and affected appointments cancelled.' });
  } catch (error) {
    console.error('Error deleting doctor:', error);
    res.status(500).json({ error: 'Internal server error deleting doctor' });
  }
});

// POST /api/admin/doctors/:id/leaves - Mark doctor on leave (handles conflict check)
router.post('/doctors/:id/leaves', async (req, res) => {
  const doctorId = parseInt(req.params.id);
  const { leave_date, resolveConflicts } = req.body;

  if (!leave_date) {
    return res.status(400).json({ error: 'Leave date is required (YYYY-MM-DD)' });
  }

  try {
    const doctor = await queryOne(`SELECT name FROM users WHERE id = ? AND role = 'doctor'`, [doctorId]);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Check for existing leave on the same day
    const leaveExists = await queryOne(
      `SELECT id FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ?`,
      [doctorId, leave_date]
    );
    if (leaveExists) {
      return res.status(400).json({ error: 'Doctor is already marked on leave for this date' });
    }

    // Check for conflicting appointments
    const conflicts = await query(
      `SELECT a.id, a.appointment_time, p.name as patient_name, p.email as patient_email, a.calendar_event_id
       FROM appointments a
       JOIN users p ON a.patient_id = p.id
       WHERE a.doctor_id = ? AND a.appointment_date = ? AND a.status = 'booked'`,
      [doctorId, leave_date]
    );

    if (conflicts.length > 0 && !resolveConflicts) {
      // Conflict exists, warn the user instead of committing
      return res.status(200).json({
        conflict: true,
        message: `There are ${conflicts.length} active appointments booked for this date.`,
        conflicts: conflicts.map(c => ({
          appointment_id: c.id,
          time: c.appointment_time,
          patient_name: c.patient_name,
        }))
      });
    }

    // Resolve conflicts if selected (or if no conflicts)
    if (conflicts.length > 0 && resolveConflicts) {
      for (const appt of conflicts) {
        // Cancel appointment
        await run(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [appt.id]);

        // Cancel Google Calendar Event
        if (appt.calendar_event_id) {
          await deleteCalendarEvent(appt.calendar_event_id);
        }

        // Cancel medication reminders if any
        await run(`UPDATE reminders SET status = 'cancelled' WHERE appointment_id = ?`, [appt.id]);

        // Add cancellation notification email to queue
        const emailTemplate = getCancellationTemplate(
          appt.patient_name,
          doctor.name,
          leave_date,
          appt.appointment_time,
          `Dr. ${doctor.name} will be on leave on this date.`
        );

        await run(
          `INSERT INTO email_queue (to_email, subject, body, status) VALUES (?, ?, ?, ?)`,
          [appt.patient_email, emailTemplate.subject, emailTemplate.html, 'pending']
        );
      }
    }

    // Register the leave
    await run(`INSERT INTO doctor_leaves (doctor_id, leave_date) VALUES (?, ?)`, [doctorId, leave_date]);

    res.status(201).json({
      conflict: false,
      message: `Leave successfully scheduled for ${leave_date}.`,
      cancelled_appointments_count: conflicts.length
    });

  } catch (error) {
    console.error('Error adding leave:', error);
    res.status(500).json({ error: 'Internal server error registering leave' });
  }
});

// DELETE /api/admin/doctors/:id/leaves/:date - Remove leave
router.delete('/doctors/:id/leaves/:date', async (req, res) => {
  const doctorId = parseInt(req.params.id);
  const { date } = req.params;

  try {
    const leaveExists = await queryOne(
      `SELECT id FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ?`,
      [doctorId, date]
    );
    if (!leaveExists) {
      return res.status(404).json({ error: 'Leave record not found for this date' });
    }

    await run(`DELETE FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ?`, [doctorId, date]);
    res.status(200).json({ message: 'Leave day removed successfully.' });
  } catch (error) {
    console.error('Error removing leave:', error);
    res.status(500).json({ error: 'Internal server error removing leave' });
  }
});

export default router;
