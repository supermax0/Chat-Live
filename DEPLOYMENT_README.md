# 🚀 Deployment Guide

This project is ready for deployment on cloud platforms. Follow the guide below for your chosen platform.

## Quick Deploy Options

### Render.com (Recommended)

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **On Render.com:**
   - Go to https://render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Render will auto-detect `render.yaml`
   - Add a Persistent Disk (1GB) for the database
   - Click "Create Web Service"

3. **Environment Variables** (auto-set by render.yaml):
   - `SECRET_KEY` - Auto-generated
   - `FLASK_ENV=production`
   - `DATABASE_URL=./chat.db`
   - `PORT` - Auto-set by Render

### Railway

1. **Install Railway CLI:**
   ```bash
   npm i -g @railway/cli
   ```

2. **Deploy:**
   ```bash
   railway login
   railway init
   railway up
   ```

3. **Set Environment Variables:**
   - `SECRET_KEY` - Generate a secure key
   - `FLASK_ENV=production`
   - `PORT` - Auto-set by Railway

### Heroku

1. **Install Heroku CLI:**
   ```bash
   # See: https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Deploy:**
   ```bash
   heroku create your-app-name
   heroku config:set SECRET_KEY=your-secret-key
   heroku config:set FLASK_ENV=production
   git push heroku main
   ```

### DigitalOcean App Platform

1. **Connect Repository:**
   - Go to DigitalOcean App Platform
   - Connect GitHub repository
   - Select "Python" as runtime

2. **Configure:**
   - Build Command: `pip install -r requirements.txt`
   - Run Command: `gunicorn --worker-class gevent -w 1 --bind 0.0.0.0:$PORT app:app`
   - Add Managed Database (PostgreSQL recommended for production)

## Environment Variables

Required for all platforms:

```env
SECRET_KEY=your-very-secure-secret-key-here
FLASK_ENV=production
DATABASE_URL=./chat.db  # Or PostgreSQL connection string
PORT=10000  # Usually auto-set by platform
```

## Database Setup

### SQLite (Default)
- Works out of the box
- Database created automatically on first run
- Use Persistent Disk on Render.com
- **Note**: For production with high traffic, consider PostgreSQL

### PostgreSQL (Recommended for Production)
1. Create PostgreSQL database on your platform
2. Update `DATABASE_URL` environment variable
3. Update `app.py` to use PostgreSQL connection string

## File Uploads

The `uploads/` directory structure is preserved:
- `uploads/images/` - Chat images
- `uploads/products/` - Product images/videos

**Important**: On cloud platforms, consider using:
- **AWS S3** for file storage
- **Cloudinary** for image hosting
- **DigitalOcean Spaces** for object storage

## Health Checks

All platforms check the root path `/` for health:
- ✅ Returns `index.html`
- ✅ Confirms server is running

## Monitoring

After deployment:
1. Check application logs
2. Monitor WebSocket connections
3. Verify file uploads work
4. Test all three pages:
   - Customer: `https://your-app.com/`
   - Admin: `https://your-app.com/admin.html`
   - Sales Rep: `https://your-app.com/sales-dashboard.html`

## Troubleshooting

### Database Locked Errors
- Ensure only 1 worker (`-w 1` in gunicorn)
- SQLite WAL mode is enabled (already configured)

### WebSocket Issues
- Verify `async_mode='gevent'` in app.py
- Check CORS settings
- Ensure platform supports WebSockets

### Static Files Not Loading
- Verify `public/` directory structure
- Check file paths in HTML files
- Review platform static file serving

## Security Checklist

Before going live:
- [ ] Change default admin password
- [ ] Set strong `SECRET_KEY`
- [ ] Restrict CORS origins (remove `*`)
- [ ] Enable HTTPS (usually automatic)
- [ ] Review file upload limits
- [ ] Set up monitoring and alerts

---

**Need Help?** Check the main [README.md](README.md) or open an issue on GitHub.
