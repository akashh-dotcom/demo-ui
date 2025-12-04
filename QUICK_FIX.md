# Quick Fix Guide - Current Errors

This guide addresses the two errors you're currently experiencing.

## Error 1: ModuleNotFoundError: No module named 'openpyxl'

### What's happening:
The PDF converter Python script requires the `openpyxl` library, but it's not installed in your Python environment.

### Quick Fix:

**Windows:**
```bash
cd backend\PDFtoXMLUsingExcel
python -m pip install -r requirements.txt
cd ..\..
```

**Linux/Mac:**
```bash
cd backend/PDFtoXMLUsingExcel
python3 -m pip install -r requirements.txt
cd ../..
```

Then restart your backend server:
```bash
cd backend
npm start
```

### What this installs:
- openpyxl (Excel file support)
- PyMuPDF (PDF parsing)
- camelot-py (Table extraction)
- pandas, numpy (Data processing)
- And other required dependencies

---

## Error 2: Invalid login: 535-5.7.8 Username and Password not accepted

### What's happening:
Gmail requires **App Passwords** for SMTP authentication. Your regular Gmail password will NOT work.

### Quick Fix Option 1: Disable Email (Fastest)

Edit `backend/.env` file:
```env
EMAIL_ENABLED=false
```

Then restart your backend server. The application will work normally without sending emails.

### Quick Fix Option 2: Set Up Gmail App Password (Recommended)

1. **Enable 2-Factor Authentication:**
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable 2-Step Verification if not already enabled

2. **Generate App Password:**
   - Still in Security settings
   - Click on "2-Step Verification"
   - Scroll down to "App passwords"
   - Select "Mail" and "Other (Custom name)"
   - Name it "Document Conversion Service"
   - Click "Generate"
   - Copy the 16-character password (looks like: `abcd efgh ijkl mnop`)

3. **Update your `.env` file:**
   ```env
   EMAIL_ENABLED=true
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=abcdefghijklmnop  # Paste App Password here (remove spaces)
   ```

4. **Restart backend server:**
   ```bash
   cd backend
   npm start
   ```

### For detailed email setup instructions:
See: `backend/EMAIL_SETUP_GUIDE.md`

---

## Summary of Required Actions

To get your application working properly:

1. ✅ **Install Python Dependencies** (Required for PDF conversion to work):
   ```bash
   cd backend/PDFtoXMLUsingExcel
   python -m pip install -r requirements.txt  # Windows
   # OR
   python3 -m pip install -r requirements.txt  # Linux/Mac
   ```

2. ✅ **Fix Email Configuration** (Choose one):
   - **Option A (Quick):** Set `EMAIL_ENABLED=false` in `backend/.env`
   - **Option B (Full setup):** Generate Gmail App Password and configure `.env`

3. ✅ **Restart the server:**
   ```bash
   cd backend
   npm start
   ```

---

## Expected Outcome

After completing these steps:

✅ PDF conversion will work without `ModuleNotFoundError`
✅ Email notifications will either be disabled or working with proper authentication
✅ File processing will complete successfully
✅ Users will receive email notifications (if enabled)

---

## Still Having Issues?

### Check Python Installation:
```bash
# Windows:
python --version
python -m pip --version

# Linux/Mac:
python3 --version
python3 -m pip --version
```

### Check Node.js Server Logs:
Look for any errors when the server starts or when processing files.

### Verify Environment Variables:
Make sure your `backend/.env` file exists and has all required settings from `backend/.env.example`

---

## Additional Resources

- Complete Setup Guide: `SETUP_GUIDE.md`
- Email Configuration Guide: `backend/EMAIL_SETUP_GUIDE.md`
- Backend README: `backend/README.md`
- PDF Converter Dependencies: `backend/PDFtoXMLUsingExcel/requirements.txt`
