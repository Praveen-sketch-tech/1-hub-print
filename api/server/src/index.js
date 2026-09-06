require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || require('path').join(__dirname, '../../../.env'), override: true });
const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shops');
const uploadRoutes = require('./routes/upload');
const jobRoutes = require('./routes/jobs');
const fileRoutes = require('./routes/files');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/files', fileRoutes);
app.use('/p', express.static(path.join(__dirname, '../../../apps/customer/public')));

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
