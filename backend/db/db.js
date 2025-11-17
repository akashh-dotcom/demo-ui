const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Check if MONGODB_URI is set
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    // Connect to MongoDB (deprecated options removed as of Driver v4.0.0+)
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database Name: ${conn.connection.name}`);
  } catch (error) {
    console.error('\n❌ MongoDB Connection Error:');
    console.error(`Error: ${error.message}`);

    // Provide helpful error messages based on error type
    if (error.message.includes('bad auth') || error.message.includes('Authentication failed')) {
      console.error('\n💡 Authentication failed. Please check:');
      console.error('   1. Your MongoDB username and password are correct');
      console.error('   2. The user has proper permissions for the database');
      console.error('   3. Your connection string format is correct:');
      console.error('      mongodb://username:password@host:port/database');
      console.error('      OR for MongoDB Atlas:');
      console.error('      mongodb+srv://username:password@cluster.mongodb.net/database');
    } else if (error.message.includes('ENOTFOUND')) {
      console.error('\n💡 Could not connect to MongoDB server. Please check:');
      console.error('   1. MongoDB server is running');
      console.error('   2. The hostname/IP in your connection string is correct');
      console.error('   3. Your network connection is working');
    }

    console.error('\nCurrent MONGODB_URI:', process.env.MONGODB_URI?.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
    process.exit(1);
  }
};

module.exports = connectDB;