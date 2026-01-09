# دليل الإعداد السريع

## الإعداد الأولي

### 1. استنساخ المستودع

```bash
git clone https://github.com/yourusername/live-chat.git
cd live-chat
```

### 2. إنشاء بيئة افتراضية

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**Linux/Mac:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. تثبيت المتطلبات

```bash
pip install -r requirements.txt
```

### 4. إعداد متغيرات البيئة

انسخ `.env.example` إلى `.env` وعدّل القيم:

```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

ثم عدّل `.env`:
```env
SECRET_KEY=your-very-secure-secret-key-here
FLASK_ENV=development
PORT=10000
DATABASE_URL=./chat.db
```

### 5. تشغيل الخادم

```bash
python app.py
```

### 6. الوصول للتطبيق

- **صفحة العميل**: http://localhost:10000/
- **لوحة المندوب**: http://localhost:10000/sales-dashboard.html
- **لوحة الإدمن**: http://localhost:10000/admin.html

## الحسابات الافتراضية

**⚠️ مهم: غيّر هذه في الإنتاج!**

- **الإدمن**: `admin` / `admin123`

## استكشاف الأخطاء

### خطأ في تثبيت eventlet

```bash
# Windows - قد تحتاج Visual C++ Build Tools
# Linux/Mac
sudo apt-get install python3-dev  # Ubuntu/Debian
brew install python3-dev          # macOS
```

### خطأ في قاعدة البيانات

احذف `chat.db` وأعد التشغيل - سيتم إنشاء قاعدة بيانات جديدة.

### المنفذ مستخدم

غيّر `PORT` في `.env` أو في `app.py`.

## الخطوات التالية

1. راجع [README.md](README.md) للتعرف على الميزات
2. راجع [README_DEPLOYMENT.md](README_DEPLOYMENT.md) للنشر
3. راجع [CONTRIBUTING.md](CONTRIBUTING.md) للمساهمة
