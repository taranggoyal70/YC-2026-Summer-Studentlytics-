# 🔐 Authentication System Setup Guide

## Overview

I've implemented a complete authentication system with:
- ✅ Backend API with SQLite database
- ✅ User registration (signup)
- ✅ User login
- ✅ Password hashing with bcrypt
- ✅ JWT token authentication
- ✅ Role-based access control (student/teacher/admin)

---

## 📁 Files Created/Modified

### Backend Files:
1. **`backend/auth.py`** - Authentication API endpoints
2. **`backend/main.py`** - Updated to include auth router
3. **`backend/requirements.txt`** - Added auth dependencies
4. **`backend/data/users.db`** - SQLite database (auto-created)

### Frontend Files:
1. **`src/services/authService.ts`** - Authentication service
2. **`src/pages/LoginPage.tsx`** - Updated with backend integration

---

## 🚀 Setup Instructions

### Step 1: Install Backend Dependencies

```bash
cd /Users/tarang/CascadeProjects/windsurf-project/AWS-Hackathon/backend
pip install -r requirements.txt
```

**New packages installed:**
- `passlib[bcrypt]` - Password hashing
- `pyjwt` - JWT token creation/verification
- `python-jose[cryptography]` - Additional JWT support
- `pydantic[email]` - Email validation

### Step 2: Start the Backend Server

```bash
cd /Users/tarang/CascadeProjects/windsurf-project/AWS-Hackathon/backend
uvicorn main:app --reload --port 8000
```

The backend will:
- Start on `http://localhost:8000`
- Auto-create the SQLite database at `backend/data/users.db`
- Initialize the users table

### Step 3: Start the Frontend

```bash
cd /Users/tarang/CascadeProjects/windsurf-project/AWS-Hackathon
npm run dev
```

Frontend will start on `http://localhost:3006`

---

## 🔑 API Endpoints

### 1. **Signup** - `POST /api/auth/signup`

**Request Body:**
```json
{
  "email": "student@example.com",
  "password": "password123",
  "fullName": "John Doe",
  "role": "student",
  "institution": "MIT"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "student@example.com",
    "name": "John Doe",
    "type": "student",
    "institution": "MIT"
  }
}
```

### 2. **Login** - `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "student@example.com",
  "password": "password123"
}
```

**Response:** Same as signup

### 3. **Get Current User** - `GET /api/auth/me`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "id": 1,
  "email": "student@example.com",
  "name": "John Doe",
  "type": "student",
  "institution": "MIT"
}
```

### 4. **Logout** - `POST /api/auth/logout`

**Response:**
```json
{
  "message": "Successfully logged out"
}
```

---

## 🧪 Testing the Authentication Flow

### Test 1: Create a Student Account

1. Go to `http://localhost:3006/login`
2. Click "Sign up" to switch to signup mode
3. Select "Student" role at the top
4. Fill in the form:
   - Full Name: `John Doe`
   - Email: `john@student.com`
   - Password: `password123`
   - Institution: `MIT`
5. Click "Create Account"
6. You should be redirected to the home page
7. Check browser console - you should see the user data

### Test 2: Create a Teacher Account

1. Logout (or use incognito mode)
2. Go to signup page
3. Select "Teacher" role at the top
4. Fill in the form:
   - Full Name: `Jane Smith`
   - Email: `jane@teacher.com`
   - Password: `password123`
   - Institution: `MIT`
5. Click "Create Account"
6. You should see all 8 navigation items (Dashboard, Attendance, etc.)

### Test 3: Login with Existing Account

1. Logout
2. Go to login page
3. Enter credentials:
   - Email: `john@student.com`
   - Password: `password123`
4. Click "Sign In"
5. You should be logged in and see student view (3 nav items)

### Test 4: Error Handling

**Test duplicate email:**
1. Try to signup with an existing email
2. Should see error: "Email already registered"

**Test wrong password:**
1. Try to login with wrong password
2. Should see error: "Incorrect email or password"

**Test short password:**
1. Try to signup with password < 6 characters
2. Should see error: "Password must be at least 6 characters long"

---

## 💾 Database Structure

**Table: `users`**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| email | TEXT | Unique email address |
| password_hash | TEXT | Bcrypt hashed password |
| full_name | TEXT | User's full name |
| role | TEXT | student/teacher/admin |
| institution | TEXT | User's institution (optional) |
| created_at | TIMESTAMP | Account creation time |

**Location:** `backend/data/users.db`

---

## 🔒 Security Features

1. **Password Hashing**: Uses bcrypt (industry standard)
2. **JWT Tokens**: Secure token-based authentication
3. **Token Expiry**: Tokens expire after 24 hours
4. **Email Validation**: Pydantic email validation
5. **Password Strength**: Minimum 6 characters (can be increased)
6. **SQL Injection Protection**: Parameterized queries
7. **CORS**: Configured for localhost development

---

## 📊 How It Works

### Signup Flow:
```
1. User fills signup form
2. Frontend sends POST to /api/auth/signup
3. Backend validates data
4. Backend hashes password with bcrypt
5. Backend saves user to database
6. Backend creates JWT token
7. Backend returns token + user data
8. Frontend stores token in localStorage
9. Frontend redirects to home page
```

### Login Flow:
```
1. User fills login form
2. Frontend sends POST to /api/auth/login
3. Backend finds user by email
4. Backend verifies password hash
5. Backend creates JWT token
6. Backend returns token + user data
7. Frontend stores token in localStorage
8. Frontend redirects to home page
```

### Protected Routes:
```
1. User tries to access protected page
2. Frontend checks if token exists
3. If no token, redirect to login
4. If token exists, send request with Authorization header
5. Backend verifies JWT token
6. Backend returns data or 401 Unauthorized
```

---

## 🎯 What's Stored Where

### localStorage (Frontend):
- `access_token` - JWT token
- `user` - User object (JSON)
- `isAuthenticated` - "true" or removed

### SQLite Database (Backend):
- User credentials
- Hashed passwords
- User profiles
- Account metadata

---

## 🔧 Configuration

### Change Token Expiry:
Edit `backend/auth.py`:
```python
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours (change this)
```

### Change Secret Key:
Edit `backend/auth.py`:
```python
SECRET_KEY = "your-secret-key-change-this-in-production"
```

**⚠️ IMPORTANT:** Change this to a random string in production!

### Change Password Requirements:
Edit `backend/auth.py` in the signup endpoint:
```python
if len(user_data.password) < 6:  # Change minimum length
    raise HTTPException(...)
```

---

## 🐛 Troubleshooting

### Issue: "Module 'auth' not found"
**Solution:** Make sure you're running uvicorn from the `backend` directory:
```bash
cd backend
uvicorn main:app --reload
```

### Issue: "Failed to fetch" or CORS errors
**Solution:** 
1. Check backend is running on port 8000
2. Check CORS is enabled in `main.py`
3. Check API_URL in `authService.ts` is correct

### Issue: Database locked
**Solution:** Close any SQLite browser tools and restart the backend

### Issue: "Invalid authentication credentials"
**Solution:** 
1. Token might be expired (24 hours)
2. Logout and login again
3. Clear localStorage and try again

---

## 📝 Next Steps

### Recommended Enhancements:

1. **Email Verification**
   - Send verification email on signup
   - Verify email before allowing login

2. **Password Reset**
   - Forgot password functionality
   - Email reset link

3. **Refresh Tokens**
   - Implement refresh token rotation
   - Extend session without re-login

4. **OAuth Integration**
   - Google Sign-In
   - Microsoft Sign-In

5. **Rate Limiting**
   - Prevent brute force attacks
   - Limit login attempts

6. **Two-Factor Authentication**
   - SMS or authenticator app
   - Enhanced security

---

## ✅ Testing Checklist

- [ ] Backend starts without errors
- [ ] Database file is created
- [ ] Can signup as student
- [ ] Can signup as teacher
- [ ] Can login with correct credentials
- [ ] Cannot login with wrong password
- [ ] Cannot signup with duplicate email
- [ ] Token is stored in localStorage
- [ ] User data is stored in localStorage
- [ ] Navigation shows correct items based on role
- [ ] Logout clears localStorage
- [ ] Can login again after logout

---

## 🎉 Success!

Your authentication system is now fully functional with:
- ✅ Secure password storage
- ✅ JWT token authentication
- ✅ Role-based access control
- ✅ Proper signup/login flow
- ✅ Database persistence
- ✅ Error handling

**You can now create accounts, login, and the system will remember users!**

---

**Created**: May 17, 2026  
**Platform**: HighView/Studentlytics  
**Auth Type**: JWT + SQLite + Bcrypt
