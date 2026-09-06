const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const pool = require('../db');
const { signToken } = require('../utils/jwt');

const router = express.Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  shopName: z.string().min(2),
});

router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const { email, password, shopName } = parsed.data;

  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await client.query('BEGIN');

    const userResult = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );
    const user = userResult.rows[0];

    const shopResult = await client.query(
      'INSERT INTO shops (user_id, name) VALUES ($1, $2) RETURNING id, name, shop_code',
      [user.id, shopName]
    );
    const shop = shopResult.rows[0];

    await client.query('COMMIT');

    const token = signToken({ userId: user.id, email: user.email });
    res.status(201).json({ token, user, shop });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Signup failed' });
  } finally {
    client.release();
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  const { email, password } = parsed.data;

  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.password_hash, s.id AS shop_id, s.name AS shop_name, s.shop_code
       FROM users u
       LEFT JOIN shops s ON s.user_id = u.id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const row = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, row.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken({ userId: row.id, email: row.email });
    res.json({
      token,
      user: { id: row.id, email: row.email },
      shop: { id: row.shop_id, name: row.shop_name, shop_code: row.shop_code },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
