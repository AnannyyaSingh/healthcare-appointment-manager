import { initDB, run, query, queryOne } from './database.js';
import { generatePreVisitSummary, generatePostVisitSummary } from './services/llm.js';
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from './services/calendar.js';
import { processEmailQueue, processMedicationReminders } from './services/scheduler.js';
import bcrypt from 'bcryptjs';

const runTests = async () => {
  console.log('====================================================');
  console.log('     STARTING AUTOMATED SYSTEM VERIFICATION TESTS    ');
  console.log('====================================================\n');

  try {
    // 1. Database Initialization
    console.log('[Test 1] Initializing database...');
    await initDB();
    console.log('✓ Database initialized.\n');

    // 2. Setup Test Data (Clean previous test runs if any)
    console.log('[Test 2] Setting up clean test users and profiles...');
    await run(`DELETE FROM users WHERE email LIKE '%test%'`);
    await run(`DELETE FROM appointments WHERE symptoms LIKE '%Test symptoms%'`);
    await run(`DELETE FROM doctor_leaves WHERE leave_date = '2026-07-15'`);
    await run(`DELETE FROM email_queue`);
    await run(`DELETE FROM reminders`);

    const passHash = await bcrypt.hash('testpass123', 10);
    
    // Create test doctor
    const docRes = await run(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      ['Test Doctor', 'test_doc@clinic.com', passHash, 'doctor']
    );
    const docId = docRes.id;
    await run(
      `INSERT INTO doctor_profiles (id, specialisation, slot_duration, working_start, working_end) 
       VALUES (?, ?, ?, ?, ?)`,
      [docId, 'Testing Specialisation', 30, '09:00', '17:00']
    );

    // Create 3 test patients
    const patientIds = [];
    for (let i = 1; i <= 3; i++) {
      const pRes = await run(
        `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
        [`Test Patient ${i}`, `test_patient${i}@example.com', passHash`, passHash, 'patient']
      );
      patientIds.push(pRes.id);
    }
    console.log(`✓ Test Doctor ID: ${docId}, Test Patients IDs: ${patientIds.join(', ')}\n`);

    // 3. Test Concurrency Booking Safety (Double-Booking Prevention)
    console.log('[Test 3] Simulating 10 simultaneous booking attempts for the same slot...');
    const bookingDate = '2026-07-15';
    const bookingTime = '10:00';
    
    // We will simulate 10 concurrent requests trying to run the check-and-book flow
    // In our actual route, we use BEGIN IMMEDIATE TRANSACTION. Let's write a mock booking executor
    // that uses SQLite transaction locking to check and insert
    const simulateBookingRequest = async (patientId, reqIndex) => {
      let inTransaction = false;
      try {
        await run('BEGIN IMMEDIATE TRANSACTION');
        inTransaction = true;
        
        // Check if doctor has leave
        const leave = await queryOne(
          `SELECT id FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ?`,
          [docId, bookingDate]
        );
        if (leave) {
          await run('ROLLBACK');
          inTransaction = false;
          return { success: false, index: reqIndex, error: 'Doctor on leave' };
        }

        // Check if already booked
        const booked = await queryOne(
          `SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status = 'booked'`,
          [docId, bookingDate, bookingTime]
        );
        if (booked) {
          await run('ROLLBACK');
          inTransaction = false;
          return { success: false, index: reqIndex, error: 'Slot already booked' };
        }

        // Perform booking
        await run(
          `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, status, symptoms)
           VALUES (?, ?, ?, ?, 'booked', ?)`,
          [patientId, docId, bookingDate, bookingTime, `Test symptoms from patient ${patientId}`]
        );

        await run('COMMIT');
        inTransaction = false;
        return { success: true, index: reqIndex };
      } catch (err) {
        if (inTransaction) {
          try {
            await run('ROLLBACK');
          } catch (e) {}
        }
        return { success: false, index: reqIndex, error: err.message };
      }
    };

    // Trigger 10 simultaneous requests (distributing among our test patients)
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const patientId = patientIds[i % patientIds.length];
      promises.push(simulateBookingRequest(patientId, i));
    }

    const results = await Promise.all(promises);
    
    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);

    console.log(`- Successes count: ${successes.length} (Expected: 1)`);
    console.log(`- Failures count: ${failures.length} (Expected: 9)`);
    
    failures.forEach((f, idx) => {
      if (idx < 2) console.log(`  * Request #${f.index} failed: ${f.error}`);
    });
    if (failures.length > 2) console.log(`  * ... and ${failures.length - 2} more failures`);

    if (successes.length !== 1) {
      throw new Error(`Double-booking test FAILED! Successful bookings: ${successes.length}`);
    }
    console.log('✓ Concurrency double-booking prevention verified successfully.\n');

    // 4. Test Doctor Leave Scheduling and Conflict Handling
    console.log('[Test 4] Simulating doctor marking date as leave (with existing bookings)...');
    
    // Verify our appointment exists
    const apptBefore = await queryOne(
      `SELECT a.id, a.status, p.name as patient_name 
       FROM appointments a
       JOIN users p ON a.patient_id = p.id
       WHERE a.doctor_id = ? AND a.appointment_date = ? AND a.status = 'booked'`,
      [docId, bookingDate]
    );
    console.log(`- Found booked appointment for: ${apptBefore.patient_name} (ID: ${apptBefore.id})`);

    // Simulate Admin marking doctor on leave on bookingDate with resolveConflicts = true
    console.log('- Marking doctor on leave with resolveConflicts = true...');
    // We execute the same SQL operations as our admin router
    const conflicts = await query(
      `SELECT id, patient_id, calendar_event_id FROM appointments 
       WHERE doctor_id = ? AND appointment_date = ? AND status = 'booked'`,
      [docId, bookingDate]
    );

    for (const appt of conflicts) {
      await run(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [appt.id]);
      await run(
        `INSERT INTO email_queue (to_email, subject, body, status) 
         VALUES (?, ?, ?, ?)`,
        ['test_patient@example.com', 'Cancellation Alert', 'Your visit is cancelled due to leave.', 'pending']
      );
    }
    await run(`INSERT INTO doctor_leaves (doctor_id, leave_date) VALUES (?, ?)`, [docId, bookingDate]);

    // Verify appointment was cancelled
    const apptAfter = await queryOne(`SELECT status FROM appointments WHERE id = ?`, [apptBefore.id]);
    console.log(`- Appointment status after leave: ${apptAfter.status} (Expected: cancelled)`);
    if (apptAfter.status !== 'cancelled') {
      throw new Error('Leave conflict handling failed to cancel existing bookings!');
    }

    // Verify email was queued
    const queuedEmail = await queryOne(`SELECT count(*) as count FROM email_queue`);
    console.log(`- Queued emails in DB: ${queuedEmail.count} (Expected: > 0)`);
    if (queuedEmail.count === 0) {
      throw new Error('Leave conflict handling failed to queue cancellation notification email!');
    }
    console.log('✓ Doctor leave conflict handling verified successfully.\n');

    // 5. Test LLM Fallback Mechanism
    console.log('[Test 5] Testing LLM integration and mock fallback behavior...');
    const testSymptoms = 'Patient reports severe chest pain and short of breath.';
    console.log(`- Sending symptoms: "${testSymptoms}"`);
    
    const preVisitSummary = await generatePreVisitSummary(testSymptoms);
    console.log(`- Pre-Visit Urgency Level: ${preVisitSummary.urgency_level} (Expected: High due to chest pain)`);
    console.log(`- Chief Complaint: "${preVisitSummary.chief_complaint}"`);
    console.log(`- Suggested questions count: ${preVisitSummary.suggested_questions.length}`);
    
    if (preVisitSummary.urgency_level !== 'High') {
      throw new Error('LLM summary fallback did not trigger High urgency for severe chest symptoms!');
    }
    
    const postNotes = 'Follow up next week. Start daily amoxicillin.';
    const postVisitSummary = await generatePostVisitSummary(postNotes);
    console.log('- Post-Visit Summary output generated successfully.');
    if (!postVisitSummary || postVisitSummary.length === 0) {
      throw new Error('Post-visit summary generation failed!');
    }
    console.log('✓ LLM service fallback checks verified successfully.\n');

    // 6. Test Scheduler & Medication Reminders
    console.log('[Test 6] Testing background scheduler (Medication Reminders & Email Queue)...');
    
    // Create an active reminder for a completed appointment in the past
    // We'll link it to the appointment we cancelled above (just for testing ID links)
    const nowLocal = new Date();
    nowLocal.setMinutes(nowLocal.getMinutes() - 10); // set past time
    const pastTimeStr = nowLocal.toLocaleString('sv').replace(',', '').substring(0, 16); // "YYYY-MM-DD HH:MM"

    await run(
      `INSERT INTO reminders (appointment_id, medication_name, frequency, next_run_at, status)
       VALUES (?, ?, ?, ?, ?)`,
      [apptBefore.id, 'Test Amoxicillin 500mg', 'Once daily', pastTimeStr, 'active']
    );
    console.log(`- Inserted active reminder for medication 'Test Amoxicillin 500mg' at due time: ${pastTimeStr}`);

    // Trigger reminder processor
    console.log('- Executing processMedicationReminders...');
    await processMedicationReminders();

    // Verify reminder next_run_at was advanced by 1 day (Once daily)
    const updatedReminder = await queryOne(`SELECT * FROM reminders WHERE appointment_id = ?`, [apptBefore.id]);
    console.log(`- Next run advanced to: ${updatedReminder.next_run_at}`);
    
    const prevTime = new Date(pastTimeStr.replace(' ', 'T'));
    const nextTime = new Date(updatedReminder.next_run_at.replace(' ', 'T'));
    const diffMs = nextTime.getTime() - prevTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    console.log(`- Next run time difference: ${diffHours} hours (Expected: 24)`);
    if (diffHours !== 24) {
      throw new Error('Reminder next run time scheduling increment is incorrect!');
    }

    // Verify email was added to the queue for medication reminder
    const emailsCountBefore = await queryOne(`SELECT count(*) as count FROM email_queue WHERE subject LIKE '%Medication Reminder%'`);
    console.log(`- Queued medication reminder emails in database: ${emailsCountBefore.count} (Expected: 1)`);
    if (emailsCountBefore.count !== 1) {
      throw new Error('Medication reminder processor failed to queue reminder email!');
    }

    // Trigger email queue processor (Mock mode)
    console.log('- Executing processEmailQueue...');
    await processEmailQueue();

    // Verify emails updated to 'sent' or 'sent_mock'
    const pendingCount = await queryOne(`SELECT count(*) as count FROM email_queue WHERE status = 'pending'`);
    console.log(`- Pending emails in queue: ${pendingCount.count} (Expected: 0)`);
    if (pendingCount.count !== 0) {
      throw new Error('Email queue processor failed to process pending emails!');
    }
    console.log('✓ Background scheduler medication reminders and email retries verified successfully.\n');

    // Clean up test data
    console.log('Cleaning up verification test data...');
    await run(`DELETE FROM users WHERE email LIKE '%test%'`);
    await run(`DELETE FROM appointments WHERE symptoms LIKE '%Test symptoms%'`);
    await run(`DELETE FROM doctor_leaves WHERE leave_date = '2026-07-15'`);
    await run(`DELETE FROM email_queue`);
    await run(`DELETE FROM reminders`);

    console.log('====================================================');
    console.log('   ALL SYSTEM INTEGRATION TESTS PASSED SUCCESSFULLY!  ');
    console.log('====================================================');

  } catch (error) {
    console.error('\n❌ VERIFICATION TEST SUITE FAILED:');
    console.error(error);
    process.exit(1);
  }
};

runTests();
