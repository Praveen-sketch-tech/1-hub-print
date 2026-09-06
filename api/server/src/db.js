require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || require('path').join(__dirname, '../../../.env'), override: true });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
