/**
 * Seed script to create initial admin user
 *
 * Usage:
 *   node scripts/seedAdmin.js
 *
 * Or with custom credentials:
 *   ADMIN_USERNAME=myadmin ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=mypassword node scripts/seedAdmin.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Default admin credentials (override with environment variables)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rittenhouse.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function seedAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/RittenhouseXMLConverter';
    console.log(`Connecting to MongoDB: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Define User schema inline (to avoid import issues)
    const userSchema = new mongoose.Schema({
      username: { type: String, required: true, unique: true },
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      role: { type: String, enum: ['user', 'admin'], default: 'user' },
    }, { timestamps: true });

    const User = mongoose.models.User || mongoose.model('User', userSchema);

    // Check if admin already exists
    const existingAdmin = await User.findOne({
      $or: [{ username: ADMIN_USERNAME }, { email: ADMIN_EMAIL }]
    });

    if (existingAdmin) {
      console.log(`Admin user already exists: ${existingAdmin.username} (${existingAdmin.email})`);
      console.log('To create a new admin, use different ADMIN_USERNAME and ADMIN_EMAIL');
      process.exit(0);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

    // Create admin user
    const admin = await User.create({
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin'
    });

    console.log('\n✅ Admin user created successfully!');
    console.log('─'.repeat(40));
    console.log(`   Username: ${admin.username}`);
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   Role:     ${admin.role}`);
    console.log('─'.repeat(40));
    console.log('\n⚠️  Please change the password after first login!\n');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error.message);
    process.exit(1);
  }
}

seedAdmin();
