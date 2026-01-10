# Deployment Guide for Render.com

This guide explains how to deploy the Live Chat application to Render.com.

## Prerequisites

1. A Render.com account (sign up at https://render.com)
2. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Deployment Steps

### 1. Prepare Your Repository

Make sure all files are committed and pushed to your Git repository:
- `app.py` (main application)
- `requirements.txt` (Python dependencies)
- `Procfile` (start command for Render)
- `render.yaml` (optional, for infrastructure as code)
- `public/` directory (static files)
- `.gitignore` (to exclude unnecessary files)

### 2. Create a New Web Service on Render

1. Go to your Render dashboard
2. Click "New +" → "Web Service"
3. Connect your Git repository
4. Render will auto-detect the settings from `render.yaml` or you can configure manually:

**Manual Configuration:**
- **Name**: live-chat-app (or your preferred name)
- **Environment**: Python 3
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn --worker-class gevent -w 1 --bind 0.0.0.0:$PORT --timeout 120 --access-logfile - --error-logfile - app:app`
- **Plan**: Starter (or higher for production)

### 3. Environment Variables

Set these environment variables in Render dashboard:

- `SECRET_KEY`: Generate a secure random string (Render can auto-generate this)
- `FLASK_ENV`: `production`
- `DATABASE_URL`: `./chat.db` (or leave default)
- `PORT`: Automatically set by Render (don't override)

### 4. Persistent Disk (for Database)

Since SQLite files need persistence:

1. In your service settings, go to "Disks"
2. Click "Link Existing Disk" or "Create New Disk"
3. Name: `chat-db`
4. Mount Path: `/opt/render/project/src`
5. Size: 1 GB (or more if needed)

**Important**: Update `DATABASE_URL` in environment variables to point to the disk:
```
DATABASE_URL=/opt/render/project/src/chat.db
```

### 5. Deploy

1. Click "Create Web Service"
2. Render will build and deploy your application
3. Monitor the build logs for any errors
4. Once deployed, your app will be available at `https://your-app-name.onrender.com`

## WebSocket Configuration

Render.com supports WebSockets out of the box. The application is configured to use:
- **Eventlet** as the async worker
- **Flask-SocketIO** with proper CORS settings
- **Gunicorn** with gevent worker class

No additional configuration needed for WebSockets on Render.

## Static Files

Static files in the `public/` directory are served by Flask. The application handles:
- `/` → `index.html`
- `/admin.html` → Admin panel
- `/sales-dashboard.html` → Sales rep dashboard
- `/uploads/*` → Uploaded files (images, videos)

## File Uploads

Uploaded files are stored in the `uploads/` directory. For production, consider:
1. Using a persistent disk (as configured above)
2. Or integrating with cloud storage (AWS S3, Cloudinary, etc.)

## Troubleshooting

### Database Locked Errors
- Ensure only one worker is running (`-w 1` in gunicorn command)
- SQLite WAL mode is enabled in the code

### WebSocket Connection Issues
- Check that `async_mode='gevent'` is set in SocketIO initialization
- Verify CORS settings allow your domain
- Check Render logs for connection errors

### Static Files Not Loading
- Verify `public/` directory is in your repository
- Check file paths are correct
- Review Render build logs for missing files

### Build Failures
- Ensure all dependencies in `requirements.txt` are correct
- Check Python version matches `runtime.txt` (3.11.9)
- Review build logs for specific error messages

## Monitoring

- **Logs**: View real-time logs in Render dashboard
- **Metrics**: Monitor CPU, memory, and response times
- **Health Checks**: Configured to check `/` endpoint

## Scaling

For production with higher traffic:
1. Upgrade to a higher plan (Starter → Professional)
2. Consider using PostgreSQL instead of SQLite
3. Use Redis for SocketIO message queue
4. Add a CDN for static assets

## Security Notes

1. **Change SECRET_KEY**: Never use the default secret key in production
2. **CORS**: Update CORS settings to restrict origins in production
3. **HTTPS**: Render provides HTTPS automatically
4. **Database**: Consider encrypting sensitive data

## Support

For issues specific to:
- **Render.com**: Check Render documentation or support
- **Application**: Review application logs in Render dashboard
- **WebSocket**: Check browser console and Render logs
