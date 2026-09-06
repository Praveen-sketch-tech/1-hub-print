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
const shopDashboardRoutes = require('./routes/shop');
const agentRoutes = require('./routes/agent');
const systemRoutes = require('./routes/system');
const { authLimiter, uploadLimiter } = require('./middleware/rateLimiter');

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

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/upload', uploadLimiter, uploadRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/shop', shopDashboardRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/system', systemRoutes);
app.use('/p', express.static(path.join(__dirname, '../../../apps/customer/public')));
app.use('/dashboard', express.static(path.join(__dirname, '../../../apps/shop/public')));

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
