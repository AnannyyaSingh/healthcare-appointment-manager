import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { initDB, seedDB } from './database.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import patientRouter from './routes/patient.js';
import doctorRouter from './routes/doctor.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security and utility middleware
app.use(helmet());
app.use(cors({
  origin: '*', // Allow frontend development requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register routers
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/patient', patientRouter);
app.use('/api/doctor', doctorRouter);

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'An unexpected error occurred on the server.' });
});

// Start Express Server
const startServer = async () => {
  try {
    // 1. Initialise database tables & seed default accounts
    await initDB();
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      await seedDB();
    }

    // 2. Start the background scheduler for reminders & email retries (checks every 30s)
    const interval = process.env.SCHEDULER_INTERVAL_MS ? parseInt(process.env.SCHEDULER_INTERVAL_MS) : 30000;
    startScheduler(interval);

    // 3. Start listening
    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(` Clinic Management Server listening on port ${PORT} `);
      console.log(` Mode: ${process.env.NODE_ENV || 'development'}      `);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Handle graceful shutdowns
const graceClose = () => {
  console.log('Shutting down server gracefully...');
  stopScheduler();
  process.exit(0);
};

process.on('SIGTERM', graceClose);
process.on('SIGINT', graceClose);
