# HighView - Vercel Deployment Guide

## 🚀 Quick Deployment Steps

### 1. Prerequisites
- GitHub account
- Vercel account (sign up at [vercel.com](https://vercel.com))
- Push your code to GitHub repository

### 2. Deploy to Vercel

#### Option A: Deploy via Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**
   - Visit [vercel.com/new](https://vercel.com/new)
   - Sign in with GitHub

2. **Import Your Repository**
   - Click "Add New Project"
   - Select "Import Git Repository"
   - Choose your HighView repository

3. **Configure Project**
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (or leave default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **Environment Variables** (if needed)
   - Click "Environment Variables"
   - Add any required variables (see below)

5. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes for build to complete
   - Your app will be live at `https://your-project-name.vercel.app`

#### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to project directory
cd /Users/tarang/CascadeProjects/windsurf-project/AWS-Hackathon

# Login to Vercel
vercel login

# Deploy
vercel

# For production deployment
vercel --prod
```

---

## 📋 Configuration Files Created

### ✅ `vercel.json`
- Configures build settings
- Sets up SPA routing (all routes → index.html)
- Configures CORS headers for API calls

### ✅ `.vercelignore`
- Excludes unnecessary files from deployment
- Keeps deployment size small and fast

---

## 🔧 Environment Variables (Optional)

If you need environment variables, add them in Vercel Dashboard:

**Settings → Environment Variables**

Example variables you might need:
```
VITE_API_URL=https://your-api-url.com
VITE_AWS_API_KEY=your-api-key-here
```

**Note**: Vite requires env vars to be prefixed with `VITE_`

---

## 🎯 What Gets Deployed

### Frontend (Vercel)
- ✅ React + TypeScript app
- ✅ All pages and components
- ✅ Static assets (images, fonts, etc.)
- ✅ Built and optimized for production

### Backend (Separate - Already Deployed)
- ✅ AWS Lambda functions (already running)
- ✅ Face recognition API
- ✅ AI chatbot API
- ✅ Authentication endpoints

**Note**: Your backend is already deployed on AWS. Vercel will only host the frontend. The frontend will make API calls to your existing AWS backend.

---

## 🔗 Post-Deployment

### 1. Custom Domain (Optional)
- Go to your project in Vercel Dashboard
- Click "Settings" → "Domains"
- Add your custom domain
- Follow DNS configuration instructions

### 2. Update Backend CORS
If you get CORS errors, update your backend to allow your Vercel domain:

```python
# In your backend/main.py or backend/auth.py
origins = [
    "http://localhost:3006",
    "https://your-project-name.vercel.app",  # Add this
    "https://your-custom-domain.com",        # If using custom domain
]
```

### 3. Test Your Deployment
- ✅ Test login/signup
- ✅ Test video upload
- ✅ Test AI chatbot
- ✅ Test all role-based views (student/staff)
- ✅ Test all pages and features

---

## 🐛 Troubleshooting

### Build Fails
**Error**: `Module not found` or `Cannot find module`
**Solution**: 
```bash
# Locally test the build
npm run build

# If it works locally, check Vercel build logs
# Make sure all dependencies are in package.json, not devDependencies
```

### Blank Page After Deployment
**Issue**: Routes not working (404 on refresh)
**Solution**: Already fixed in `vercel.json` with rewrites configuration

### API Calls Failing
**Issue**: CORS errors or API not responding
**Solution**: 
1. Check if AWS backend is running
2. Update backend CORS to include Vercel domain
3. Check API URLs in your code

### Environment Variables Not Working
**Issue**: `undefined` values
**Solution**: 
1. Make sure env vars are prefixed with `VITE_`
2. Add them in Vercel Dashboard → Settings → Environment Variables
3. Redeploy after adding env vars

---

## 📊 Deployment Info

**Build Time**: ~2-3 minutes
**Deploy Time**: ~30 seconds
**Auto-Deploy**: Enabled (deploys on every git push to main)

---

## 🎉 Success!

Once deployed, your HighView app will be live at:
- **Production URL**: `https://your-project-name.vercel.app`
- **Preview URLs**: Auto-generated for each branch/PR

**Features Working**:
- ✅ Authentication (student/teacher login)
- ✅ Role-based routing and views
- ✅ All pages (Dashboard, Sessions, Analytics, etc.)
- ✅ Video upload and processing
- ✅ AI chatbot
- ✅ Add to Calendar
- ✅ Opportunities management
- ✅ Real student data across all pages

---

## 🔄 Continuous Deployment

Vercel automatically deploys when you push to GitHub:

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Vercel automatically builds and deploys
# Check deployment status in Vercel Dashboard
```

---

## 📞 Support

- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Vite Docs**: [vitejs.dev](https://vitejs.dev)
- **Vercel Support**: [vercel.com/support](https://vercel.com/support)

---

**Your HighView app is ready to deploy! 🚀**
