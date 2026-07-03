import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the calendar log directory exists
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const calendarLogPath = path.join(logDir, 'calendar_log.json');

let calendar = null;
const isGoogleConfigured = 
  process.env.GOOGLE_CLIENT_ID && 
  process.env.GOOGLE_CLIENT_SECRET && 
  process.env.GOOGLE_REDIRECT_URI && 
  process.env.GOOGLE_REFRESH_TOKEN;

if (isGoogleConfigured) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    console.log('Google Calendar API service initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Google Calendar client:', error);
  }
} else {
  console.log('No Google Calendar OAuth config found. Calendar events will be logged to: backend/logs/calendar_log.json');
}

/**
 * Log calendar actions to file for checking in mock mode
 */
const logCalendarAction = async (action, eventId, eventData) => {
  try {
    let logs = [];
    if (fs.existsSync(calendarLogPath)) {
      const data = fs.readFileSync(calendarLogPath, 'utf8');
      logs = JSON.parse(data || '[]');
    }
    logs.push({
      timestamp: new Date().toISOString(),
      action,
      eventId,
      eventData,
    });
    fs.writeFileSync(calendarLogPath, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('Error logging calendar action to file:', err);
  }
};

/**
 * Create Google Calendar Event
 */
export const createCalendarEvent = async ({
  summary,
  description,
  startDateTime,
  endDateTime,
  attendeeEmails = []
}) => {
  if (calendar) {
    try {
      const event = {
        summary,
        description,
        start: {
          dateTime: new Date(startDateTime).toISOString(),
          timeZone: process.env.TIMEZONE || 'UTC',
        },
        end: {
          dateTime: new Date(endDateTime).toISOString(),
          timeZone: process.env.TIMEZONE || 'UTC',
        },
        attendees: attendeeEmails.map(email => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      };

      const res = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        sendUpdates: 'all',
      });

      console.log(`Google Calendar Event created: ${res.data.id}`);
      await logCalendarAction('create', res.data.id, event);
      return res.data.id;
    } catch (error) {
      console.error('Google Calendar event creation failed, falling back to mock:', error.message);
    }
  }

  // Fallback / Mock mode
  const mockId = `mock-cal-event-${Math.random().toString(36).substr(2, 9)}`;
  const mockEvent = { summary, description, startDateTime, endDateTime, attendeeEmails };
  console.log(`[MOCK CALENDAR] CREATE EVENT: ${summary} | ID: ${mockId}`);
  await logCalendarAction('create', mockId, mockEvent);
  return mockId;
};

/**
 * Update Google Calendar Event
 */
export const updateCalendarEvent = async (eventId, {
  summary,
  description,
  startDateTime,
  endDateTime,
}) => {
  if (!eventId) return null;

  if (calendar && !eventId.startsWith('mock-')) {
    try {
      const event = {
        summary,
        description,
        start: {
          dateTime: new Date(startDateTime).toISOString(),
          timeZone: process.env.TIMEZONE || 'UTC',
        },
        end: {
          dateTime: new Date(endDateTime).toISOString(),
          timeZone: process.env.TIMEZONE || 'UTC',
        },
      };

      const res = await calendar.events.patch({
        calendarId: 'primary',
        eventId: eventId,
        resource: event,
        sendUpdates: 'all',
      });

      console.log(`Google Calendar Event updated: ${eventId}`);
      await logCalendarAction('update', eventId, event);
      return res.data.id;
    } catch (error) {
      console.error(`Google Calendar event update failed for ID ${eventId}, falling back to mock:`, error.message);
    }
  }

  // Fallback / Mock mode
  const mockEvent = { summary, description, startDateTime, endDateTime };
  console.log(`[MOCK CALENDAR] UPDATE EVENT: ${eventId} | ${summary}`);
  await logCalendarAction('update', eventId, mockEvent);
  return eventId;
};

/**
 * Delete Google Calendar Event
 */
export const deleteCalendarEvent = async (eventId) => {
  if (!eventId) return null;

  if (calendar && !eventId.startsWith('mock-')) {
    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
        sendUpdates: 'all',
      });
      console.log(`Google Calendar Event deleted: ${eventId}`);
      await logCalendarAction('delete', eventId, null);
      return true;
    } catch (error) {
      console.error(`Google Calendar event deletion failed for ID ${eventId}, falling back to mock:`, error.message);
    }
  }

  // Fallback / Mock mode
  console.log(`[MOCK CALENDAR] DELETE EVENT: ${eventId}`);
  await logCalendarAction('delete', eventId, null);
  return true;
};

export default {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
};
