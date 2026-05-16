import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'spill_dev_secret_change_in_prod';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    let rows;
    try {
      const result = await query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
        [name.trim(), email.toLowerCase().trim(), password_hash]
      );
      rows = result.rows;
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'email already in use' });
      }
      throw err;
    }

    const user = rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'invalid email or password' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'invalid email or password' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
});

export default router;
