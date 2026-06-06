const request = require('supertest');
const mongoose = require('mongoose');
const { app, server } = require('../control');
const { User } = require('../db');

// In-memory MongoDB could be used here, but for simplicity we will connect
// to the actual test database or default MongoDB URI and clean it up.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saikumar22102005:projectstartup@cluster0.spzm4pc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

describe('API Integration Tests', () => {
  let userToken;
  let adminToken;

  beforeAll(async () => {
    // Increase timeout for connection setup
    jest.setTimeout(15000);

    // Ensure we are connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
    }
    
    // Clear users
    await User.deleteMany({ email: /@test\.com$/ });

    // Create a regular test user
    const userRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'user@test.com',
        password: 'password123'
      });
    userToken = userRes.body.token;

    // Create an admin test user via register endpoint
    const adminResReg = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin User',
        email: 'admin@test.com',
        password: 'password123'
      });
    adminToken = adminResReg.body.token;

    // Promote to admin
    await User.updateOne({ email: 'admin@test.com' }, { role: 'admin' });
  }, 20000);

  afterAll(async () => {
    await User.deleteMany({ email: /@test\.com$/ });
    await mongoose.connection.close();
    server.close();
  });

  describe('Authentication Routes', () => {
    it('should login a user and return a token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@test.com',
          password: 'password123'
        });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe('user@test.com');
    });

    it('should fail login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@test.com',
          password: 'wrongpassword'
        });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Invalid credentials');
    });
  });

  describe('Protected API Routes', () => {
    it('should reject unauthenticated requests to /api/servers', async () => {
      const res = await request(app).get('/api/servers');
      expect(res.statusCode).toBe(401);
    });

    it('should allow authenticated requests to /api/servers', async () => {
      const res = await request(app)
        .get('/api/servers')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('servers');
      expect(Array.isArray(res.body.servers)).toBe(true);
    });
  });

  describe('Admin Routes', () => {
    it('should reject normal users from /api/admin/vms', async () => {
      const res = await request(app)
        .get('/api/admin/vms')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/Admin role required/i);
    });

    it('should allow admins to access /api/admin/vms', async () => {
      const res = await request(app)
        .get('/api/admin/vms')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('vms');
      expect(Array.isArray(res.body.vms)).toBe(true);
    });
  });
});
