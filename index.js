require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Initialize connections
require('./config/db');
require('./config/redis');

// Database initializer
const { initializeDatabase } = require('./services/dbInitializer');

// Routes
const authRoutes = require('./routes/authRoutes');
const contentRoutes = require('./routes/contentRoutes');
const masjidRoutes = require('./routes/masjidRoutes');      
const adminRoutes = require('./routes/adminRoutes');      

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

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});


// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong' });
});

// Start server (with DB initialization)
const PORT = process.env.PORT || 3050;
const LOCAL_URL = `http://localhost:${PORT}`;

(async () => {
  try {
    // Run DB initializer BEFORE server starts
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log('');
      
      console.log('Annoor Backend API is running');
      
      console.log(`   Environment : ${process.env.NODE_ENV}`);
      console.log(`   Port        : ${PORT}`);
      console.log(`   Local URL   : ${LOCAL_URL}`);
      console.log(`   App URL     : ${process.env.APP_BASE_URL || 'N/A'}`);
     
      console.log('');
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
})();