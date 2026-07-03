import express from 'express';
import bcrypt from 'bcryptjs';
// import jwt from 'jwt-simple'; // wait, we are using jsonwebtoken in package.json and middleware/auth.js! Let's import jsonwebtoken instead.
import { queryOne, run } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import dotenv from 'dotenv';

// Use standard jsonwebtoken
import jsonwebtoken from 'jsonwebtoken';

dotenv.config();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-super-secret-key-12345';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!['patient', 'doctor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid user role specified' });
  }

  try {
    const existingUser = await queryOne(`SELECT id FROM users WHERE email = ?`, [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await run(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      [name, email, hash, role]
    );

    // If they registered as a doctor, seed a blank profile so the admin can manage it
    if (role === 'doctor') {
      await run(
        `INSERT INTO doctor_profiles (id, specialisation, slot_duration, working_start, working_end) VALUES (?, ?, ?, ?, ?)`,
        [result.id, 'General Medicine', 30, '09:00', '17:00']
      );
    }

    const token = jsonwebtoken.sign({ id: result.id, name, email, role }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: result.id, name, email, role }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await queryOne(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jsonwebtoken.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await queryOne(`SELECT id, name, email, role, created_at FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({ user });
  } catch (error) {
    console.error('Fetch profile error:', error);
    res.status(500).json({ error: 'Internal server error fetching user profile' });
  }
});

export default router;
