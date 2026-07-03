import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the email log directory exists
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const emailLogPath = path.join(logDir, 'email_log.json');

// Try to create standard SMTP transport if configured
let transporter = null;
const isSMTPConfigured = process.env.SMTP_HOST && process.env.SMTP_USER;

if (isSMTPConfigured) {
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '',
      },
    });
    console.log(`SMTP Email Transport configured for ${process.env.SMTP_HOST}`);
  } catch (error) {
    console.error('Failed to configure SMTP transport:', error);
  }
} else {
  console.log('No SMTP config found. Emails will be logged to: backend/logs/email_log.json');
}

/**
 * Log sent emails to a file for mock checking
 */
const logEmailToFile = async (emailData) => {
  try {
    let logs = [];
    if (fs.existsSync(emailLogPath)) {
      const data = fs.readFileSync(emailLogPath, 'utf8');
      logs = JSON.parse(data || '[]');
    }
    logs.push({
      timestamp: new Date().toISOString(),
      ...emailData,
    });
    fs.writeFileSync(emailLogPath, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('Error logging email to file:', err);
  }
};

/**
 * General send email function. If SMTP is configured, sends real mail.
 * Otherwise logs it. Supports throwing errors so that the retry-queue can catch them.
 */
export const sendMail = async ({ to, subject, html, text }) => {
  const emailPayload = { to, subject, body: html || text };
  
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Clinic Manager" <no-reply@clinic.com>',
        to,
        subject,
        text,
        html,
      });
      console.log(`Email successfully sent to ${to}. Message ID: ${info.messageId}`);
      await logEmailToFile({ ...emailPayload, status: 'sent', messageId: info.messageId });
      return true;
    } catch (error) {
      console.error(`Email delivery to ${to} failed:`, error.message);
      await logEmailToFile({ ...emailPayload, status: 'failed', error: error.message });
      throw error; // Re-throw to let the caller handle queue retries
    }
  } else {
    // Mock mode
    console.log(`[MOCK EMAIL] TO: ${to} | SUBJECT: ${subject}`);
    await logEmailToFile({ ...emailPayload, status: 'sent_mock' });
    return true;
  }
};

// HTML Email Templates

export const getBookingConfirmationTemplate = (patientName, doctorName, date, time) => {
  return {
    subject: `Appointment Confirmed: Dr. ${doctorName} - ${date}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #4f46e5;">Appointment Confirmation</h2>
        <p>Dear ${patientName},</p>
        <p>Your healthcare appointment has been successfully booked.</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <strong style="display: block; margin-bottom: 5px;">Appointment Details:</strong>
          <strong>Doctor:</strong> ${doctorName}<br>
          <strong>Date:</strong> ${date}<br>
          <strong>Time:</strong> ${time}
        </div>
        <p>If you need to reschedule or cancel, please log in to your patient portal.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280;">This is an automated system email. Please do not reply.</p>
      </div>
    `,
    text: `Dear ${patientName},\n\nYour appointment with ${doctorName} has been confirmed for ${date} at ${time}.\n\nBest regards,\nClinic Team`
  };
};

export const getCancellationTemplate = (patientName, doctorName, date, time, reason = '') => {
  return {
    subject: `Appointment Cancelled: Dr. ${doctorName} - ${date}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #dc2626;">Appointment Cancelled</h2>
        <p>Dear ${patientName},</p>
        <p>We regret to inform you that your appointment with <strong>${doctorName}</strong> scheduled for <strong>${date} at ${time}</strong> has been cancelled.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>Please log in to your portal to reschedule or book a new slot with another doctor.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280;">This is an automated system email. Please do not reply.</p>
      </div>
    `,
    text: `Dear ${patientName},\n\nWe regret to inform you that your appointment with ${doctorName} scheduled for ${date} at ${time} has been cancelled. ${reason ? `Reason: ${reason}` : ''}\n\nBest regards,\nClinic Team`
  };
};

export const getMedicationReminderTemplate = (patientName, medicationName, frequency) => {
  return {
    subject: `Medication Reminder: ${medicationName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #10b981;">Medication Reminder</h2>
        <p>Dear ${patientName},</p>
        <p>This is a friendly reminder to take your medication.</p>
        <div style="background-color: #ecfdf5; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #10b981;">
          <strong>Medication Name:</strong> ${medicationName}<br>
          <strong>Frequency:</strong> ${frequency}
        </div>
        <p>Always take your medications as directed by your healthcare provider.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280;">This is an automated system email. Please do not reply.</p>
      </div>
    `,
    text: `Dear ${patientName},\n\nThis is a friendly reminder to take your medication: ${medicationName} (${frequency}).\n\nBest regards,\nClinic Team`
  };
};

export default {
  sendMail,
  getBookingConfirmationTemplate,
  getCancellationTemplate,
  getMedicationReminderTemplate
};
