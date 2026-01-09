# 📁 Project Structure

This document describes the production-ready structure of the Live Chat application.

## Directory Structure

```
live-chat/
├── app.py                      # Main Flask application
├── requirements.txt            # Python dependencies
├── Procfile                   # Production process file
├── render.yaml                # Render.com configuration
├── runtime.txt                # Python version
├── .gunicorn.conf.py         # Gunicorn configuration
│
├── public/                    # Static files (served as root)
│   ├── index.html            # Customer chat page
│   ├── admin.html            # Admin dashboard
│   ├── sales-dashboard.html   # Sales rep dashboard
│   │
│   ├── js/                   # JavaScript files
│   │   ├── customer.js      # Customer chat logic
│   │   ├── admin.js         # Admin dashboard logic
│   │   └── sales-rep.js     # Sales rep dashboard logic
│   │
│   ├── css/                  # Stylesheets
│   │   └── styles.css       # Main stylesheet
│   │
│   └── assets/              # Static assets (images, fonts, etc.)
│       └── .gitkeep
│
├── uploads/                  # User-uploaded files
│   ├── images/              # Chat images
│   └── products/            # Product images/videos
│
└── chat.db                   # SQLite database (not in Git)
```

## File Organization

### HTML Files
- Located in `public/` root
- Reference assets using relative paths:
  - CSS: `css/styles.css`
  - JS: `js/customer.js`, `js/admin.js`, `js/sales-rep.js`

### JavaScript Files
- All JavaScript files are in `public/js/`
- Organized by functionality:
  - `customer.js` - Customer chat interface
  - `admin.js` - Admin dashboard
  - `sales-rep.js` - Sales representative dashboard

### CSS Files
- All stylesheets are in `public/css/`
- Single main stylesheet: `styles.css`

### Assets
- `public/assets/` for static assets like:
  - Images (logos, icons)
  - Fonts
  - Other static resources

## URL Structure

Flask is configured with:
- `static_folder='public'` - Points to the public directory
- `static_url_path=''` - Serves files from root URL

This means:
- `/` → `public/index.html`
- `/admin.html` → `public/admin.html`
- `/css/styles.css` → `public/css/styles.css`
- `/js/customer.js` → `public/js/customer.js`
- `/assets/logo.png` → `public/assets/logo.png`

## Benefits of This Structure

1. **Organization**: Clear separation of concerns
2. **Scalability**: Easy to add new JS/CSS files
3. **Maintainability**: Easy to find and update files
4. **Performance**: Can be optimized with CDN for assets
5. **Production-Ready**: Follows industry best practices

## Adding New Files

### Adding a JavaScript File
1. Place in `public/js/`
2. Reference in HTML: `<script src="js/filename.js"></script>`

### Adding a CSS File
1. Place in `public/css/`
2. Reference in HTML: `<link rel="stylesheet" href="css/filename.css">`

### Adding Assets
1. Place in `public/assets/`
2. Reference in HTML: `<img src="assets/image.png">`

## Migration Notes

The project was refactored from a flat structure to this organized structure:
- **Before**: All files in `public/` root
- **After**: Organized into `js/`, `css/`, and `assets/` subdirectories

All HTML files have been updated to reference the new paths.
