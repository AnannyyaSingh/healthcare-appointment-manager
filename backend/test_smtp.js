import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

console.log('Sending test email to verify SMTP credentials...');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_USER:', process.env.SMTP_USER);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS.replace(/\s+/g, ''),
  },
});

try {
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || '"Clinic Manager" <no-reply@clinic.com>',
    to: process.env.SMTP_USER, // Send to self
    subject: 'SMTP Connection Test Success ✔',
    text: 'Hello! Your healthcare appointment manager email SMTP connection is fully operational.',
    html: '<b>Hello!</b> Your healthcare appointment manager email SMTP connection is fully operational.'
  });
  console.log('Email sent successfully! Message ID:', info.messageId);
} catch (error) {
  console.error('SMTP Test Failed with error:', error);
}
