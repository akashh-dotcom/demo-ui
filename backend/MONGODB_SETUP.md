# MongoDB Setup & Troubleshooting Guide

## Common MongoDB Authentication Error

If you see this error:
```
Error: bad auth : Authentication failed.
```

This means MongoDB cannot authenticate with the credentials in your connection string.

## Solutions

### Solution 1: Use Local MongoDB WITHOUT Authentication (Easiest)

If you're running MongoDB locally without authentication enabled:

1. Edit your `.env` file:
   ```env
   MONGODB_URI=mongodb://localhost:27017/fileprocessing
   ```

2. Make sure MongoDB is running:
   ```bash
   # Windows
   net start MongoDB

   # Linux/Mac
   sudo systemctl start mongod
   # OR
   mongod
   ```

### Solution 2: Local MongoDB WITH Authentication

If your MongoDB has authentication enabled:

1. Create a database user in MongoDB shell:
   ```bash
   mongosh
   ```

   ```javascript
   use fileprocessing

   db.createUser({
     user: "fileprocessinguser",
     pwd: "yourpassword",
     roles: [
       { role: "readWrite", db: "fileprocessing" }
     ]
   })
   ```

2. Update your `.env`:
   ```env
   MONGODB_URI=mongodb://fileprocessinguser:yourpassword@localhost:27017/fileprocessing
   ```

### Solution 3: MongoDB Atlas (Cloud)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user:
   - Click "Database Access" → "Add New Database User"
   - Choose "Password" authentication
   - Set username and password
   - Grant "Read and write to any database" permissions

4. Get your connection string:
   - Click "Database" → "Connect" → "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your actual password
   - Replace `<database>` with `fileprocessing`

5. Whitelist your IP:
   - Click "Network Access" → "Add IP Address"
   - Click "Allow Access from Anywhere" (for development)
   - Or add your current IP address

6. Update your `.env`:
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/fileprocessing
   ```

### Solution 4: Check if MongoDB is Running

#### Windows:
```bash
# Check if MongoDB service is running
sc query MongoDB

# Start MongoDB
net start MongoDB
```

#### Linux:
```bash
# Check status
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod

# Enable MongoDB to start on boot
sudo systemctl enable mongod
```

#### Mac:
```bash
# Check if running
brew services list

# Start MongoDB
brew services start mongodb-community
```

## Verify MongoDB Connection

Test your MongoDB connection with mongosh:

```bash
# Without authentication
mongosh mongodb://localhost:27017/fileprocessing

# With authentication
mongosh "mongodb://username:password@localhost:27017/fileprocessing"

# MongoDB Atlas
mongosh "mongodb+srv://username:password@cluster.mongodb.net/fileprocessing"
```

If the connection works in mongosh, it should work in the application.

## Common Issues

### Issue: "ENOTFOUND" error
**Solution:** MongoDB server hostname is wrong or MongoDB is not running.

### Issue: "Connection timeout"
**Solution:**
- Check if MongoDB is running
- Check firewall settings
- For Atlas: Whitelist your IP address

### Issue: "Authentication failed"
**Solution:** Username, password, or database name is incorrect in your connection string.

### Issue: Special characters in password
If your password contains special characters like `@`, `#`, `!`, etc., you need to URL-encode them:

| Character | Encoded |
|-----------|---------|
| @         | %40     |
| :         | %3A     |
| /         | %2F     |
| ?         | %3F     |
| #         | %23     |
| [         | %5B     |
| ]         | %5D     |

Example:
```env
# Password: MyPass@123!
MONGODB_URI=mongodb://user:MyPass%40123!@localhost:27017/fileprocessing
```

## Quick Start for Development

The easiest way to get started is using MongoDB without authentication:

1. Install MongoDB Community Edition
2. Start MongoDB service
3. Set `.env`:
   ```env
   MONGODB_URI=mongodb://localhost:27017/fileprocessing
   ```
4. Run the application:
   ```bash
   npm run dev
   ```

MongoDB will automatically create the `fileprocessing` database when you insert the first document.
