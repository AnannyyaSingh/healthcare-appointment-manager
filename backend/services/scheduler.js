import { query, run } from '../database.js';
import { sendMail, getMedicationReminderTemplate } from './email.js';

let schedulerInterval = null;

/**
 * Process the email queue
 * Retries failed or pending emails up to 3 times.
 */
export const processEmailQueue = async () => {
  try {
    const pendingEmails = await query(
      `SELECT * FROM email_queue WHERE status IN ('pending', 'failed') AND retry_count < 3 LIMIT 10`
    );

    for (const email of pendingEmails) {
      console.log(`[Scheduler] Processing email ID ${email.id} to ${email.to_email}...`);
      try {
        await sendMail({
          to: email.to_email,
          subject: email.subject,
          html: email.body
        });

        // Update status to sent
        await run(
          `UPDATE email_queue SET status = 'sent', error_message = NULL WHERE id = ?`,
          [email.id]
        );
      } catch (err) {
        const nextRetryCount = email.retry_count + 1;
        const newStatus = nextRetryCount >= 3 ? 'failed' : 'failed'; // Keep failed status
        
        await run(
          `UPDATE email_queue SET status = ?, retry_count = ?, error_message = ? WHERE id = ?`,
          [newStatus, nextRetryCount, err.message, email.id]
        );
        console.error(`[Scheduler] Email ID ${email.id} failed attempt ${nextRetryCount}: ${err.message}`);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error processing email queue:', error);
  }
};

/**
 * Process medication reminders
 * Sends active reminders where next_run_at <= now, and updates next_run_at based on frequency.
 */
export const processMedicationReminders = async () => {
  try {
    const nowLocalStr = new Date().toLocaleString('sv').replace(',', '').substring(0, 16); // "YYYY-MM-DD HH:MM"
    
    // Find active reminders that are due
    const dueReminders = await query(
      `SELECT r.*, a.patient_id, p.name as patient_name, p.email as patient_email
       FROM reminders r
       JOIN appointments a ON r.appointment_id = a.id
       JOIN users p ON a.patient_id = p.id
       WHERE r.status = 'active' AND r.next_run_at <= ?`,
      [nowLocalStr]
    );

    for (const reminder of dueReminders) {
      console.log(`[Scheduler] Sending medication reminder for ${reminder.medication_name} to ${reminder.patient_email}...`);
      
      const emailTemplate = getMedicationReminderTemplate(
        reminder.patient_name,
        reminder.medication_name,
        reminder.frequency
      );

      // Queue the email instead of sending directly, to respect the queue system
      await run(
        `INSERT INTO email_queue (to_email, subject, body, status) VALUES (?, ?, ?, ?)`,
        [reminder.patient_email, emailTemplate.subject, emailTemplate.html, 'pending']
      );

      // Calculate next run time
      let nextRun = new Date(reminder.next_run_at.replace(' ', 'T'));
      if (isNaN(nextRun.getTime())) {
        nextRun = new Date();
      }

      const freq = reminder.frequency.toLowerCase();
      if (freq.includes('twice daily') || freq.includes('12 hours')) {
        nextRun.setHours(nextRun.getHours() + 12);
      } else if (freq.includes('three times daily') || freq.includes('8 hours')) {
        nextRun.setHours(nextRun.getHours() + 8);
      } else if (freq.includes('once daily') || freq.includes('24 hours') || freq.includes('daily')) {
        nextRun.setDate(nextRun.getDate() + 1);
      } else {
        // Default: next day
        nextRun.setDate(nextRun.getDate() + 1);
      }

      const nextRunStr = nextRun.toLocaleString('sv').replace(',', '').substring(0, 16); // "YYYY-MM-DD HH:MM"

      // Update reminder
      await run(
        `UPDATE reminders SET next_run_at = ? WHERE id = ?`,
        [nextRunStr, reminder.id]
      );
    }
  } catch (error) {
    console.error('[Scheduler] Error processing medication reminders:', error);
  }
};

/**
 * Start the background scheduler
 * Runs the queue processors at specified interval (default 30 seconds).
 */
export const startScheduler = (intervalMs = 30000) => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log(`[Scheduler] Background job runner started (Interval: ${intervalMs / 1000}s)`);
  
  // Run once immediately
  processEmailQueue();
  processMedicationReminders();

  schedulerInterval = setInterval(async () => {
    await processEmailQueue();
    await processMedicationReminders();
  }, intervalMs);
};

/**
 * Stop the background scheduler
 */
export const stopScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Scheduler] Background job runner stopped.');
  }
};

export default {
  startScheduler,
  stopScheduler,
  processEmailQueue,
  processMedicationReminders
};
