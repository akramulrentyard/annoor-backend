require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

// Initialize connections
require('./config/db');
require('./config/redis');

// Database initializer
const { initializeDatabase } = require('./services/dbInitializer');

// Auto-renewal service
const { processAutoRenewals } = require('./services/autoRenewService');

// Routes
const authRoutes = require('./routes/authRoutes');
const contentRoutes = require('./routes/contentRoutes');
const masjidRoutes = require('./routes/masjidRoutes');
const adminRoutes = require('./routes/adminRoutes');
const halalPlaceRoutes = require('./routes/halalPlaceRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');   // 👈 NEW

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Annoor backend api is running',
    environment: process.env.NODE_ENV,
    appUrl: process.env.APP_BASE_URL
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', contentRoutes);
app.use('/api/masjid', masjidRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', halalPlaceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);                   // 👈 NEW

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong' });
});

// ════════════════════════════════════════════════════════════════════
// Cron Setup
// ════════════════════════════════════════════════════════════════════
function setupCronJobs() {
  // প্রতিদিন রাত ২টায় (America/New_York timezone)
  cron.schedule(
    '0 2 * * *',
    async () => {
      console.log('');
      console.log('⏰ Cron triggered @', new Date().toISOString());
      try {
        const result = await processAutoRenewals();
        console.log('✅ Cron completed:', result);
      } catch (err) {
        console.error('❌ Cron failed:', err);
      }
    },
    {
      timezone: 'America/New_York',
      scheduled: true
    }
  );

  console.log('⏰ Auto-renew cron scheduled (daily 2 AM America/New_York)');
}

// Start server
const PORT = process.env.PORT || 3050;
const LOCAL_URL = `http://localhost:${PORT}`;

(async () => {
  try {
    await initializeDatabase();

    // Cron চালু করুন DB ready হওয়ার পর
    setupCronJobs();

    app.listen(PORT, () => {
      console.log('');
      console.log('════════════════════════════════════════════════════════════');
      console.log('🚀 Annoor Backend API is running');
      console.log('════════════════════════════════════════════════════════════');
      console.log(`   Environment : ${process.env.NODE_ENV}`);
      console.log(`   Port        : ${PORT}`);
      console.log(`   Local URL   : ${LOCAL_URL}`);
      console.log(`   App URL     : ${process.env.APP_BASE_URL || 'N/A'}`);
      console.log('════════════════════════════════════════════════════════════');
      console.log('');
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
})();