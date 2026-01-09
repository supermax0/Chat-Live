# 📦 GitHub Repository Setup

## Initial Setup

### 1. Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `live-chat` (or your preferred name)
3. Description: "Real-time chat system between customers and sales representatives"
4. Choose **Public** or **Private**
5. **Do NOT** initialize with README, .gitignore, or license
6. Click "Create repository"

### 2. Connect Local Repository

```bash
# Add remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/live-chat.git

# Or using SSH
git remote add origin git@github.com:YOUR_USERNAME/live-chat.git
```

### 3. Verify .gitignore

Check that sensitive files are ignored:
```bash
git status --ignored
```

You should see:
- ✅ `chat.db*` - Database files
- ✅ `node_modules/` - Node modules
- ✅ `.env*` - Environment files
- ✅ `__pycache__/` - Python cache
- ✅ `uploads/*` - Uploaded files (structure preserved)

### 4. First Commit and Push

```bash
# Stage all files
git add .

# Commit
git commit -m "Initial commit: Live Chat System

- Real-time chat with WebSocket support
- Admin dashboard for management
- Sales rep dashboard
- Product cards with image/video support
- Session persistence
- Ready for cloud deployment"

# Push to GitHub
git branch -M main
git push -u origin main
```

## Repository Settings

### Topics (Tags)
Add these topics to your repository:
- `flask`
- `socketio`
- `websocket`
- `chat`
- `python`
- `real-time`
- `live-chat`
- `customer-support`

### Description
```
Real-time chat system built with Flask and SocketIO. Features include customer-sales rep chat, admin dashboard, product cards, and session persistence. Ready for deployment on Render.com, Railway, Heroku, and other cloud platforms.
```

### Website (if deployed)
Add your deployed URL:
- Render.com: `https://your-app.onrender.com`
- Railway: `https://your-app.railway.app`
- etc.

## Branch Protection (Optional)

For production repositories:

1. Go to Settings → Branches
2. Add rule for `main` branch:
   - ✅ Require pull request reviews
   - ✅ Require status checks
   - ✅ Require conversation resolution
   - ✅ Include administrators

## GitHub Actions

The repository includes:
- ✅ `.github/workflows/ci.yml` - Continuous Integration
- ✅ `.github/workflows/deploy.yml` - Deployment workflow

These will run automatically on push.

## Secrets (for CI/CD)

If using GitHub Actions for deployment:

1. Go to Settings → Secrets and variables → Actions
2. Add secrets:
   - `RENDER_API_KEY` (if deploying to Render)
   - `SECRET_KEY` (for production)
   - Other platform-specific keys

## Releases

To create a release:

1. Go to Releases → "Create a new release"
2. Tag version: `v1.0.0`
3. Release title: "Initial Release"
4. Description: Copy from CHANGELOG or describe features
5. Publish release

## Issues and Discussions

Enable:
- ✅ Issues (for bug reports)
- ✅ Discussions (for questions and community)

## License

The project uses **ISC License**. Make sure `LICENSE` file is in the repository.

## README Badges

Add to your README.md:

```markdown
![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-3.0.0-green.svg)
![SocketIO](https://img.shields.io/badge/SocketIO-5.3.5-orange.svg)
![License](https://img.shields.io/badge/License-ISC-lightgrey.svg)
```

## Verification Checklist

Before pushing:
- [x] `.gitignore` is complete
- [x] No sensitive data in code
- [x] Database files ignored
- [x] Environment files ignored
- [x] All dependencies in `requirements.txt`
- [x] README.md is complete
- [x] LICENSE file present
- [x] Deployment files present (Procfile, render.yaml, etc.)

---

**Ready to push!** 🚀
