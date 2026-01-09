# دليل رفع المشروع على GitHub

## الخطوات

### 1. إنشاء مستودع جديد على GitHub

1. اذهب إلى https://github.com/new
2. أدخل اسم المستودع (مثلاً: `live-chat`)
3. اختر **Public** أو **Private**
4. **لا** تضع علامة على "Initialize with README"
5. انقر **Create repository**

### 2. ربط المستودع المحلي بـ GitHub

```bash
# أضف remote (استبدل yourusername و live-chat)
git remote add origin https://github.com/yourusername/live-chat.git

# أو باستخدام SSH
git remote add origin git@github.com:yourusername/live-chat.git
```

### 3. التحقق من الملفات

```bash
# تحقق من الملفات المضافة
git status

# تأكد من أن .gitignore يعمل بشكل صحيح
git status --ignored
```

### 4. Commit التغييرات

```bash
# أضف جميع الملفات
git add .

# Commit
git commit -m "Initial commit: Live Chat System with Flask and SocketIO"
```

### 5. Push إلى GitHub

```bash
# Push إلى main branch
git branch -M main
git push -u origin main
```

## بعد الرفع

### 1. إضافة وصف المستودع

على صفحة المستودع:
- أضف وصف: "Live Chat System - Real-time chat between customers and sales reps"
- أضف مواضيع: `flask`, `socketio`, `websocket`, `chat`, `python`, `real-time`
- أضف موقع الويب إن كان متاحاً

### 2. إضافة README Badges

يمكنك إضافة badges في بداية README.md:

```markdown
![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-3.0.0-green.svg)
![License](https://img.shields.io/badge/License-ISC-lightgrey.svg)
```

### 3. إعداد GitHub Pages (اختياري)

إذا أردت نشر الوثائق:
1. Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` / `docs`

### 4. إضافة ملفات إضافية

- **LICENSE** ✅ (تم إنشاؤه)
- **CONTRIBUTING.md** ✅ (تم إنشاؤه)
- **.github/ISSUE_TEMPLATE/** (اختياري)
- **.github/PULL_REQUEST_TEMPLATE.md** (اختياري)

## نصائح الأمان

### ⚠️ لا ترفع:

- ❌ `.env` (يحتوي على SECRET_KEY)
- ❌ `chat.db` (قاعدة البيانات)
- ❌ `node_modules/` (إذا كان موجوداً)
- ❌ ملفات المفاتيح والشهادات
- ❌ كلمات المرور في الكود

### ✅ تأكد من:

- ✅ `.gitignore` يعمل بشكل صحيح
- ✅ لا توجد معلومات حساسة في الكود
- ✅ كلمات المرور الافتراضية موثقة في README فقط

## إعدادات المستودع

### Branches Protection (للإنتاج)

1. Settings → Branches
2. Add rule for `main`
3. تفعيل:
   - Require pull request reviews
   - Require status checks
   - Require conversation resolution

### Secrets (للنشر التلقائي)

إذا أردت نشر تلقائي:
1. Settings → Secrets and variables → Actions
2. أضف:
   - `RENDER_API_KEY`
   - `SECRET_KEY`

## الخطوات التالية

1. ✅ ارفع الكود إلى GitHub
2. ✅ أضف وصف ومواضيع
3. ✅ راجع الأمان
4. ✅ اربط مع Render.com للنشر
5. ✅ شارك المشروع!

---

**ملاحظة**: استبدل `yourusername` و `live-chat` بقيمك الفعلية في جميع الأوامر.
