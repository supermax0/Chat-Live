from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, join_room, leave_room

from flask_cors import CORS
import sqlite3
import uuid
import os
import threading
import time
import base64

from datetime import datetime
from functools import wraps
from werkzeug.utils import secure_filename

app = Flask(__name__, 
            static_folder='public',
            static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here-change-in-production')
CORS(app, resources={r"/*": {"origins": "*"}})

# Configure SocketIO with threading mode
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    logger=True,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25
)
# تخزين الاتصالات النشطة
active_users = {}
waiting_customers = []
active_conversations = {}
active_sessions = {}

# قاعدة البيانات
DB_FILE = os.environ.get('DATABASE_URL', './chat.db')
# إذا كان DATABASE_URL يحتوي على مسار كامل، استخدمه مباشرة
if DB_FILE.startswith('sqlite:///'):
    DB_FILE = DB_FILE.replace('sqlite:///', '')

# مجلد رفع الملفات
UPLOAD_FOLDER = './uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'mov'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# إنشاء مجلد الرفع إذا لم يكن موجوداً
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'products'), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'images'), exist_ok=True)

# Thread-local storage للاتصالات
_local = threading.local()

def get_db():
    """الحصول على اتصال قاعدة البيانات مع thread-local storage"""
    if not hasattr(_local, 'connection') or _local.connection is None:
        _local.connection = sqlite3.connect(
            DB_FILE,
            timeout=20.0,  # انتظار 20 ثانية قبل إرجاع خطأ
            check_same_thread=False
        )
        _local.connection.row_factory = sqlite3.Row
        # تفعيل WAL mode لدعم الكتابة المتزامنة
        _local.connection.execute('PRAGMA journal_mode=WAL')
        _local.connection.execute('PRAGMA busy_timeout=30000')  # 30 ثانية
    
    # التحقق من أن الاتصال لا يزال مفتوحاً
    try:
        _local.connection.execute('SELECT 1')
    except (sqlite3.ProgrammingError, sqlite3.OperationalError):
        # الاتصال مغلق، إنشاء اتصال جديد
        _local.connection = sqlite3.connect(
            DB_FILE,
            timeout=20.0,
            check_same_thread=False
        )
        _local.connection.row_factory = sqlite3.Row
        _local.connection.execute('PRAGMA journal_mode=WAL')
        _local.connection.execute('PRAGMA busy_timeout=30000')
    
    return _local.connection

def init_db():
    """تهيئة قاعدة البيانات وإنشاء الجداول"""
    # استخدام اتصال منفصل للتهيئة (ليس thread-local)
    init_conn = sqlite3.connect(DB_FILE, timeout=20.0)
    init_conn.row_factory = sqlite3.Row
    init_conn.execute('PRAGMA journal_mode=WAL')
    init_conn.execute('PRAGMA busy_timeout=30000')
    cursor = init_conn.cursor()
    
    # جدول المستخدمين
    cursor.execute('''CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL,
        socket_id TEXT,
        is_online INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')
    
    # إضافة عمود phone إذا لم يكن موجوداً
    try:
        cursor.execute('ALTER TABLE users ADD COLUMN phone TEXT')
    except sqlite3.OperationalError:
        pass  # العمود موجود بالفعل
    
    # جدول المحادثات
    cursor.execute('''CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        sales_rep_id TEXT,
        status TEXT DEFAULT 'waiting',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id),
        FOREIGN KEY (sales_rep_id) REFERENCES users(id)
    )''')
    
    # جدول الرسائل
    cursor.execute('''CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        message TEXT NOT NULL,
        image_url TEXT,
        product_id TEXT,
        message_type TEXT DEFAULT 'text',
        read_status INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id),
        FOREIGN KEY (sender_id) REFERENCES users(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    )''')
    
    # إضافة عمود product_id و message_type إذا لم يكونا موجودين
    try:
        cursor.execute('ALTER TABLE messages ADD COLUMN product_id TEXT')
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute('ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT "text"')
    except sqlite3.OperationalError:
        pass
    
    # جدول المندوبين
    cursor.execute('''CREATE TABLE IF NOT EXISTS sales_reps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')
    
    # جدول الجلسات
    cursor.execute('''CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_type TEXT NOT NULL,
        username TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        logout_time DATETIME,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES sales_reps(id)
    )''')
    
    # جدول جلسات العملاء
    cursor.execute('''CREATE TABLE IF NOT EXISTS customer_sessions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        conversation_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    )''')
    
    # جدول المنتجات
    cursor.execute('''CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        price REAL,
        image_url TEXT,
        video_url TEXT,
        specifications TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')
    
    # إنشاء حساب إدمن افتراضي
    cursor.execute('SELECT * FROM sales_reps WHERE username = ?', ('admin',))
    existing = cursor.fetchone()
    if not existing:
        cursor.execute('''INSERT OR IGNORE INTO sales_reps 
            (id, name, username, password, is_active) 
            VALUES (?, ?, ?, ?, ?)''', 
            ('admin_1', 'الإدمن الرئيسي', 'admin', 'admin123', 1))
        print('✅ تم إنشاء حساب الإدمن الافتراضي: admin / admin123')
    else:
        print('✅ حساب الإدمن موجود بالفعل: admin / admin123')
    
    init_conn.commit()
    init_conn.close()
    print('تم الاتصال بقاعدة البيانات بنجاح')

# تهيئة قاعدة البيانات عند بدء التشغيل
init_db()

# API Routes
@app.route('/api/users/online')
def get_online_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, role FROM users WHERE is_online = 1')
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(users)

@app.route('/api/conversations/<userId>')
def get_conversations(userId):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''SELECT c.*, 
        cu.name as customer_name,
        cu.phone as customer_phone,
        sr.name as sales_rep_name,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.read_status = 0 AND m.sender_id != ?) as unread_count
        FROM conversations c
        LEFT JOIN users cu ON c.customer_id = cu.id
        LEFT JOIN users sr ON c.sales_rep_id = sr.id
        WHERE c.customer_id = ? OR c.sales_rep_id = ?
        ORDER BY c.updated_at DESC''', (userId, userId, userId))
    conversations = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(conversations)

@app.route('/api/messages/<conversationId>')
def get_messages(conversationId):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''SELECT m.*, u.name as sender_name, u.role as sender_role
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at ASC''', (conversationId,))
    messages = [dict(row) for row in cursor.fetchall()]
    # التأكد من إضافة image_url
    for msg in messages:
        if 'image_url' not in msg or msg['image_url'] is None:
            msg['image_url'] = None
    conn.close()
    return jsonify(messages)

# Admin API Routes
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'اسم المستخدم وكلمة المرور مطلوبان'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''SELECT * FROM sales_reps 
        WHERE username = ? AND password = ? AND is_active = 1''', 
        (username, password))
    admin = cursor.fetchone()
    
    if admin:
        admin_dict = dict(admin)
        session_id = str(uuid.uuid4())
        ip_address = request.remote_addr or 'unknown'
        user_agent = request.headers.get('User-Agent', 'unknown')
        
        cursor.execute('''INSERT INTO sessions 
            (id, user_id, user_type, username, ip_address, user_agent, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (session_id, admin_dict['id'], 'admin', admin_dict['username'], 
             ip_address, user_agent, 1))
        
        active_sessions[session_id] = {
            'id': session_id,
            'user_id': admin_dict['id'],
            'user_type': 'admin',
            'username': admin_dict['username'],
            'login_time': datetime.now().isoformat()
        }
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'adminId': admin_dict['id'],
            'name': admin_dict['name'],
            'sessionId': session_id
        })
    else:
        conn.close()
        return jsonify({'error': 'اسم المستخدم أو كلمة المرور غير صحيحة'}), 401

@app.route('/api/rep/login', methods=['POST'])
def rep_login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''SELECT * FROM sales_reps 
        WHERE username = ? AND password = ? AND is_active = 1''', 
        (username, password))
    rep = cursor.fetchone()
    
    if rep:
        rep_dict = dict(rep)
        session_id = str(uuid.uuid4())
        ip_address = request.remote_addr or 'unknown'
        user_agent = request.headers.get('User-Agent', 'unknown')
        
        cursor.execute('''INSERT INTO sessions 
            (id, user_id, user_type, username, ip_address, user_agent, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (session_id, rep_dict['id'], 'sales_rep', rep_dict['username'], 
             ip_address, user_agent, 1))
        
        active_sessions[session_id] = {
            'id': session_id,
            'user_id': rep_dict['id'],
            'user_type': 'sales_rep',
            'username': rep_dict['username'],
            'login_time': datetime.now().isoformat()
        }
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'repId': rep_dict['id'],
            'name': rep_dict['name'],
            'username': rep_dict['username'],
            'sessionId': session_id
        })
    else:
        conn.close()
        return jsonify({'error': 'اسم المستخدم أو كلمة المرور غير صحيحة'}), 401

@app.route('/api/admin/add-rep', methods=['POST'])
def add_rep():
    data = request.json
    name = data.get('name')
    username = data.get('username')
    password = data.get('password')
    
    if not name or not username or not password:
        return jsonify({'error': 'جميع الحقول مطلوبة'}), 400
    
    rep_id = str(uuid.uuid4())
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''INSERT INTO sales_reps 
            (id, name, username, password, is_active) 
            VALUES (?, ?, ?, ?, ?)''',
            (rep_id, name, username, password, 1))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'repId': rep_id, 'message': 'تم إضافة المندوب بنجاح'})
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'اسم المستخدم موجود بالفعل'}), 400
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/reps')
def get_reps():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # التحقق من وجود الجدول
        try:
            cursor.execute('SELECT name FROM sqlite_master WHERE type="table" AND name="sales_reps"')
            if not cursor.fetchone():
                return jsonify([])
        except:
            return jsonify([])
        
        # جلب المندوبين مع الإحصائيات
        try:
            cursor.execute('''SELECT sr.id, sr.name, sr.username, sr.is_active, sr.created_at, sr.last_activity,
                COALESCE((SELECT COUNT(*) FROM conversations c WHERE c.sales_rep_id = sr.id AND c.status = 'active'), 0) as active_conversations,
                COALESCE((SELECT COUNT(*) FROM messages m 
                    JOIN conversations c ON m.conversation_id = c.id 
                    WHERE c.sales_rep_id = sr.id 
                    AND datetime(m.created_at) > datetime('now', '-24 hours')), 0) as messages_today,
                (SELECT MAX(m.created_at) FROM messages m 
                    JOIN conversations c ON m.conversation_id = c.id 
                    WHERE c.sales_rep_id = sr.id) as last_message_time
                FROM sales_reps sr 
                WHERE sr.is_active = 1
                ORDER BY COALESCE(sr.last_activity, sr.created_at) DESC''')
            
            rows = cursor.fetchall()
            reps = []
            
            for row in rows:
                try:
                    rep_dict = {
                        'id': row['id'],
                        'name': row['name'],
                        'username': row['username'],
                        'is_active': row['is_active'],
                        'created_at': row['created_at'],
                        'last_activity': row['last_activity'],
                        'active_conversations': row['active_conversations'] or 0,
                        'messages_today': row['messages_today'] or 0,
                        'last_message_time': row['last_message_time']
                    }
                    
                    # إضافة معلومات من active_users
                    active_user = next((u for u in active_users.values() 
                                      if u.get('id') == rep_dict.get('id') and u.get('role') == 'sales_rep'), None)
                    rep_dict['is_online'] = 1 if active_user else 0
                    rep_dict['socket_id'] = active_user.get('socket_id') if active_user else None
                    
                    reps.append(rep_dict)
                except Exception as e:
                    print(f'Error processing rep row: {e}')
                    import traceback
                    traceback.print_exc()
                    continue
            
            print(f'Returning {len(reps)} reps to admin')
            return jsonify(reps)
        except sqlite3.OperationalError as e:
            print(f'SQL Error in get_reps: {e}')
            # محاولة جلب البيانات بدون JOINs معقدة
            try:
                cursor.execute('SELECT * FROM sales_reps WHERE is_active = 1')
                rows = cursor.fetchall()
                reps = []
                for row in rows:
                    rep_dict = dict(row)
                    rep_dict['active_conversations'] = 0
                    rep_dict['messages_today'] = 0
                    rep_dict['is_online'] = 0
                    reps.append(rep_dict)
                return jsonify(reps)
            except:
                return jsonify([])
    except Exception as e:
        print(f'Error in get_reps: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'حدث خطأ في جلب المندوبين: {str(e)}'}), 500

@app.route('/api/admin/stats')
def get_stats():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''SELECT 
        (SELECT COUNT(*) FROM sales_reps WHERE is_active = 1) as total_reps,
        (SELECT COUNT(*) FROM conversations WHERE status = 'waiting') as waiting_customers,
        (SELECT COUNT(*) FROM conversations WHERE status = 'active') as active_conversations,
        (SELECT COUNT(*) FROM users WHERE role = 'sales_rep' AND is_online = 1) as online_reps
    ''')
    stats = dict(cursor.fetchone())
    
    # تحديث online_reps من active_users
    online_reps_count = len([u for u in active_users.values() if u['role'] == 'sales_rep'])
    stats['online_reps'] = online_reps_count
    stats['waiting_customers'] = len(waiting_customers)
    
    conn.close()
    return jsonify(stats)

@app.route('/api/admin/rep/<rep_id>', methods=['DELETE'])
def delete_rep(rep_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE sales_reps SET is_active = 0 WHERE id = ?', (rep_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'تم حذف المندوب بنجاح'})

@app.route('/api/admin/sessions')
def get_sessions():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''SELECT * FROM sessions 
            WHERE is_active = 1
            ORDER BY last_activity DESC
            LIMIT 100''')
        sessions = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(sessions)
    except Exception as e:
        print(f'Error in get_sessions: {e}')
        import traceback
        traceback.print_exc()
        if 'conn' in locals():
            conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/sessions/<session_id>/logout', methods=['POST'])
def logout_session(session_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''UPDATE sessions SET is_active = 0, logout_time = CURRENT_TIMESTAMP 
        WHERE id = ?''', (session_id,))
    conn.commit()
    conn.close()
    
    if session_id in active_sessions:
        del active_sessions[session_id]
    
    return jsonify({'success': True, 'message': 'تم إغلاق الجلسة بنجاح'})

@app.route('/api/admin/sessions/<session_id>/validate')
def validate_admin_session(session_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''SELECT s.*, sr.name, sr.is_active as user_active 
        FROM sessions s
        JOIN sales_reps sr ON s.user_id = sr.id
        WHERE s.id = ? AND s.is_active = 1 AND sr.is_active = 1''', 
        (session_id,))
    session = cursor.fetchone()
    
    if session:
        session_dict = dict(session)
        cursor.execute('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?', 
                      (session_id,))
        conn.commit()
        conn.close()
        
        return jsonify({
            'valid': True,
            'session': {
                'id': session_dict['id'],
                'userId': session_dict['user_id'],
                'userType': session_dict['user_type'],
                'username': session_dict['username'],
                'name': session_dict['name']
            }
        })
    else:
        conn.close()
        return jsonify({'valid': False, 'error': 'الجلسة غير صالحة أو منتهية'})

@app.route('/api/rep/stats/<rep_id>')
def get_rep_stats(rep_id):
    """جلب إحصائيات المندوب"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # عدد الرسائل اليوم
        cursor.execute('''SELECT COUNT(*) as count FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE c.sales_rep_id = ? 
            AND m.sender_id = ?
            AND m.created_at > datetime('now', '-24 hours')''',
            (rep_id, rep_id))
        messages_today = cursor.fetchone()['count'] or 0
        
        conn.close()
        return jsonify({
            'messages_today': messages_today
        })
    except Exception as e:
        print(f'Error in get_rep_stats: {e}')
        if 'conn' in locals():
            conn.close()
        return jsonify({'messages_today': 0})

# API endpoints للمنتجات
@app.route('/api/admin/products', methods=['GET'])
def get_products():
    """جلب جميع المنتجات"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM products ORDER BY created_at DESC')
        products = [dict(row) for row in cursor.fetchall()]
        return jsonify(products)
    except Exception as e:
        print(f'Error in get_products: {e}')
        return jsonify({'error': 'حدث خطأ في جلب المنتجات'}), 500

def allowed_file(filename):
    """التحقق من نوع الملف"""
    if not filename:
        return False
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_uploaded_file(file, folder='products'):
    """حفظ الملف المرفوع"""
    if file and file.filename and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        filepath = os.path.join(UPLOAD_FOLDER, folder, unique_filename)
        file.save(filepath)
        return f"/uploads/{folder}/{unique_filename}"
    return None

@app.route('/api/admin/products', methods=['POST'])
def add_product():
    """إضافة منتج جديد"""
    try:
        product_id = str(uuid.uuid4())
        
        # معالجة الملفات المرفوعة
        image_url = ''
        video_url = ''
        
        if 'image' in request.files:
            image_file = request.files['image']
            if image_file.filename:
                image_url = save_uploaded_file(image_file, 'products')
        
        if 'video' in request.files:
            video_file = request.files['video']
            if video_file.filename:
                video_url = save_uploaded_file(video_file, 'products')
        
        # الحصول على البيانات الأخرى
        name = request.form.get('name', '')
        description = request.form.get('description', '')
        price = float(request.form.get('price', 0) or 0)
        specifications = request.form.get('specifications', '')
        
        # إذا كانت البيانات في JSON (للتوافق مع الكود القديم)
        if not name and request.is_json:
            data = request.json
            name = data.get('name', '')
            description = data.get('description', '')
            price = data.get('price', 0)
            specifications = data.get('specifications', '')
            image_url = data.get('image_url', '') or image_url
            video_url = data.get('video_url', '') or video_url
        
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''INSERT INTO products 
            (id, name, description, price, image_url, video_url, specifications) 
            VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (product_id, name, description, price, image_url, video_url, specifications))
        conn.commit()
        
        # جلب المنتج المضاف
        cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
        product = dict(cursor.fetchone())
        
        return jsonify(product), 201
    except Exception as e:
        print(f'Error in add_product: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'حدث خطأ في إضافة المنتج: {str(e)}'}), 500

@app.route('/api/admin/products/<product_id>', methods=['PUT'])
def update_product(product_id):
    """تحديث منتج"""
    try:
        # جلب البيانات الحالية
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
        existing = cursor.fetchone()
        if not existing:
            return jsonify({'error': 'المنتج غير موجود'}), 404
        
        existing_dict = dict(existing)
        
        # معالجة الملفات المرفوعة
        image_url = existing_dict.get('image_url', '')
        video_url = existing_dict.get('video_url', '')
        
        if 'image' in request.files:
            image_file = request.files['image']
            if image_file.filename:
                new_image_url = save_uploaded_file(image_file, 'products')
                if new_image_url:
                    # حذف الصورة القديمة
                    if image_url and image_url.startswith('/uploads/'):
                        old_path = image_url.lstrip('/')
                        if os.path.exists(old_path):
                            try:
                                os.remove(old_path)
                            except:
                                pass
                    image_url = new_image_url
        
        if 'video' in request.files:
            video_file = request.files['video']
            if video_file.filename:
                new_video_url = save_uploaded_file(video_file, 'products')
                if new_video_url:
                    # حذف الفيديو القديم
                    if video_url and video_url.startswith('/uploads/'):
                        old_path = video_url.lstrip('/')
                        if os.path.exists(old_path):
                            try:
                                os.remove(old_path)
                            except:
                                pass
                    video_url = new_video_url
        
        # الحصول على البيانات الأخرى
        name = request.form.get('name', existing_dict.get('name', ''))
        description = request.form.get('description', existing_dict.get('description', ''))
        price = float(request.form.get('price', existing_dict.get('price', 0)) or 0)
        specifications = request.form.get('specifications', existing_dict.get('specifications', ''))
        
        # إذا كانت البيانات في JSON
        if request.is_json:
            data = request.json
            name = data.get('name', name)
            description = data.get('description', description)
            price = data.get('price', price)
            specifications = data.get('specifications', specifications)
            image_url = data.get('image_url', image_url) or image_url
            video_url = data.get('video_url', video_url) or video_url
        
        cursor.execute('''UPDATE products 
            SET name = ?, description = ?, price = ?, image_url = ?, 
                video_url = ?, specifications = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?''',
            (name, description, price, image_url, video_url, specifications, product_id))
        conn.commit()
        
        cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
        product = dict(cursor.fetchone())
        
        return jsonify(product)
    except Exception as e:
        print(f'Error in update_product: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'حدث خطأ في تحديث المنتج: {str(e)}'}), 500

@app.route('/api/admin/products/<product_id>', methods=['DELETE'])
def delete_product(product_id):
    """حذف منتج"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM products WHERE id = ?', (product_id,))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        print(f'Error in delete_product: {e}')
        return jsonify({'error': 'حدث خطأ في حذف المنتج'}), 500

@app.route('/api/products', methods=['GET'])
def get_products_public():
    """جلب المنتجات (للمندوب)"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM products ORDER BY created_at DESC')
        products = [dict(row) for row in cursor.fetchall()]
        return jsonify(products)
    except Exception as e:
        print(f'Error in get_products_public: {e}')
        return jsonify({'error': 'حدث خطأ في جلب المنتجات'}), 500

# API endpoints للعملاء
@app.route('/api/admin/customers')
def get_customers():
    """جلب جميع العملاء"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''SELECT DISTINCT u.id, u.name, u.phone, u.created_at,
            (SELECT COUNT(*) FROM conversations c WHERE c.customer_id = u.id) as total_conversations,
            (SELECT COUNT(*) FROM conversations c WHERE c.customer_id = u.id AND c.status = 'active') as active_conversations,
            (SELECT MAX(updated_at) FROM conversations c WHERE c.customer_id = u.id) as last_conversation
            FROM users u
            WHERE u.role = 'customer'
            ORDER BY u.created_at DESC''')
        customers = [dict(row) for row in cursor.fetchall()]
        return jsonify(customers)
    except Exception as e:
        print(f'Error in get_customers: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'حدث خطأ في جلب العملاء'}), 500

@app.route('/api/admin/customer-sessions')
def get_customer_sessions():
    """جلب جلسات العملاء"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''SELECT cs.*, c.status as conversation_status
            FROM customer_sessions cs
            LEFT JOIN conversations c ON cs.conversation_id = c.id
            ORDER BY cs.last_activity DESC''')
        sessions = [dict(row) for row in cursor.fetchall()]
        return jsonify(sessions)
    except Exception as e:
        print(f'Error in get_customer_sessions: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'حدث خطأ في جلب جلسات العملاء'}), 500

# API endpoints للمحادثات
@app.route('/api/admin/conversations')
def get_all_conversations():
    """جلب جميع المحادثات"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''SELECT c.*, 
            cu.name as customer_name,
            cu.phone as customer_phone,
            sr.name as sales_rep_name,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
            (SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id) as last_message_time
            FROM conversations c
            LEFT JOIN users cu ON c.customer_id = cu.id
            LEFT JOIN users sr ON c.sales_rep_id = sr.id
            ORDER BY c.updated_at DESC''')
        conversations = [dict(row) for row in cursor.fetchall()]
        return jsonify(conversations)
    except Exception as e:
        print(f'Error in get_all_conversations: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'حدث خطأ في جلب المحادثات'}), 500

@app.route('/api/admin/conversations/<conversation_id>/messages')
def get_conversation_messages(conversation_id):
    """جلب رسائل محادثة معينة"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''SELECT m.*, u.name as sender_name, u.role as sender_role,
            p.name as product_name, p.description as product_description, 
            p.price as product_price, p.image_url as product_image_url,
            p.video_url as product_video_url, p.specifications as product_specifications
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            LEFT JOIN products p ON m.product_id = p.id
            WHERE m.conversation_id = ?
            ORDER BY m.created_at ASC''', (conversation_id,))
        
        messages = []
        for row in cursor.fetchall():
            msg_dict = dict(row)
            # إضافة معلومات المنتج إذا كانت موجودة
            if msg_dict.get('product_name'):
                msg_dict['product'] = {
                    'id': msg_dict.get('product_id'),
                    'name': msg_dict.get('product_name'),
                    'description': msg_dict.get('product_description'),
                    'price': msg_dict.get('product_price'),
                    'image_url': msg_dict.get('product_image_url'),
                    'video_url': msg_dict.get('product_video_url'),
                    'specifications': msg_dict.get('product_specifications')
                }
            messages.append(msg_dict)
        
        return jsonify(messages)
    except Exception as e:
        print(f'Error in get_conversation_messages: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'حدث خطأ في جلب الرسائل'}), 500

@app.route('/api/customer/session/<session_id>/validate')
def validate_customer_session(session_id):
    """التحقق من جلسة العميل"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''SELECT cs.*, c.id as conversation_id, c.status as conversation_status
            FROM customer_sessions cs
            LEFT JOIN conversations c ON cs.conversation_id = c.id
            WHERE cs.id = ?''', (session_id,))
        session = cursor.fetchone()
        
        if session:
            session_dict = dict(session)
            cursor.execute('UPDATE customer_sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?', 
                          (session_id,))
            conn.commit()
            return jsonify({
                'valid': True,
                'session': {
                    'id': session_dict['id'],
                    'customerId': session_dict['customer_id'],
                    'customerName': session_dict['customer_name'],
                    'customerPhone': session_dict['customer_phone'],
                    'conversationId': session_dict.get('conversation_id'),
                    'conversationStatus': session_dict.get('conversation_status')
                }
            })
        else:
            return jsonify({'valid': False, 'error': 'الجلسة غير موجودة'})
    except Exception as e:
        print(f'Error in validate_customer_session: {e}')
        return jsonify({'valid': False, 'error': 'حدث خطأ في التحقق من الجلسة'})

@app.route('/api/rep/sessions/<session_id>/validate')
def validate_rep_session(session_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''SELECT s.*, sr.name, sr.is_active as user_active 
        FROM sessions s
        JOIN sales_reps sr ON s.user_id = sr.id
        WHERE s.id = ? AND s.is_active = 1 AND sr.is_active = 1''', 
        (session_id,))
    session = cursor.fetchone()
    
    if session:
        session_dict = dict(session)
        cursor.execute('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?', 
                      (session_id,))
        conn.commit()
        conn.close()
        
        return jsonify({
            'valid': True,
            'session': {
                'id': session_dict['id'],
                'userId': session_dict['user_id'],
                'userType': session_dict['user_type'],
                'username': session_dict['username'],
                'name': session_dict['name']
            }
        })
    else:
        conn.close()
        return jsonify({'valid': False, 'error': 'الجلسة غير صالحة أو منتهية'})

@app.route('/api/sessions/<session_id>/activity', methods=['POST'])
def update_session_activity(session_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''UPDATE sessions SET last_activity = CURRENT_TIMESTAMP 
        WHERE id = ? AND is_active = 1''', (session_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# Socket.IO Events
@socketio.on('connect')
def handle_connect():
    print(f'مستخدم جديد متصل: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    print(f'مستخدم انقطع: {request.sid}')
    user = active_users.get(request.sid)
    
    if user:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET is_online = 0, socket_id = NULL WHERE id = ?', 
                      (user['id'],))
        
        # إغلاق الجلسات النشطة
        if user['role'] in ['sales_rep', 'admin']:
            cursor.execute('''UPDATE sessions SET is_active = 0, logout_time = CURRENT_TIMESTAMP 
                WHERE user_id = ? AND is_active = 1''', (user['id'],))
            # حذف من active_sessions
            for sid, session in list(active_sessions.items()):
                if session['user_id'] == user['id']:
                    del active_sessions[sid]
        
        conn.commit()
        conn.close()
        
        del active_users[request.sid]
        
        if user['role'] == 'customer':
            waiting_customers[:] = [w for w in waiting_customers if w['socketId'] != request.sid]
        
        if request.sid in active_conversations:
            del active_conversations[request.sid]
        
        socketio.emit('users_online', list(active_users.values()))
        socketio.emit('waiting_customers_update', len(waiting_customers))

@socketio.on('register')
def handle_register(user_data):
    user_id = user_data.get('id') or str(uuid.uuid4())
    name = user_data.get('name')
    phone = user_data.get('phone', '')
    role = user_data.get('role')
    
    max_retries = 5
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''INSERT OR REPLACE INTO users 
                (id, name, phone, role, socket_id, is_online) 
                VALUES (?, ?, ?, ?, ?, ?)''',
                (user_id, name, phone, role, request.sid, 1))
            conn.commit()
            
            active_users[request.sid] = {
                'id': user_id,
                'name': name,
                'phone': phone,
                'role': role,
                'socket_id': request.sid
            }
            
            # تحديث آخر نشاط للجلسة
            if role in ['sales_rep', 'admin']:
                try:
                    cursor.execute('''UPDATE sessions SET last_activity = CURRENT_TIMESTAMP 
                        WHERE user_id = ? AND is_active = 1''', (user_id,))
                    conn.commit()
                except Exception as e:
                    print(f'Error updating session activity: {e}')
            
            if role == 'customer':
                # حفظ جلسة العميل
                session_id = str(uuid.uuid4())
                conversation_id = None
                
                try:
                    # البحث عن محادثة موجودة أو إنشاء محادثة جديدة
                    cursor.execute('''SELECT * FROM conversations 
                        WHERE customer_id = ? AND (status = 'active' OR status = 'waiting') LIMIT 1''', (user_id,))
                    conversation = cursor.fetchone()
                    
                    if not conversation:
                        conversation_id = str(uuid.uuid4())
                        cursor.execute('''INSERT INTO conversations 
                            (id, customer_id, status) VALUES (?, ?, ?)''',
                            (conversation_id, user_id, 'waiting'))
                        conn.commit()
                        
                        waiting_customers.append({
                            'conversationId': conversation_id,
                            'customerId': user_id,
                            'socketId': request.sid
                        })
                        
                        # محاولة تعيين مندوب مبيعات
                        try:
                            assign_sales_rep(conversation_id, user_id)
                        except Exception as e:
                            print(f'Error assigning sales rep: {e}')
                        
                        socketio.emit('conversation_created', {'conversationId': conversation_id})
                        socketio.emit('waiting_customers_update', len(waiting_customers))
                    else:
                        conversation_id = conversation['id']
                        socketio.emit('conversation_joined', {'conversationId': conversation_id})
                    
                    # حفظ جلسة العميل
                    if conversation_id:
                        cursor.execute('''INSERT OR REPLACE INTO customer_sessions 
                            (id, customer_id, customer_name, customer_phone, conversation_id) 
                            VALUES (?, ?, ?, ?, ?)''',
                            (session_id, user_id, name, phone, conversation_id))
                        conn.commit()
                        
                        # إرسال session_id للعميل
                        socketio.emit('customer_session', {'sessionId': session_id, 'conversationId': conversation_id})
                except Exception as e:
                    print(f'Error in customer registration: {e}')
                    import traceback
                    traceback.print_exc()
                    # حتى لو فشل حفظ الجلسة، نكمل التسجيل
                    pass
            elif role == 'sales_rep':
                socketio.emit('waiting_customers_update', len(waiting_customers))
                assign_waiting_customers(request.sid, user_id)
            
            socketio.emit('registered', {'userId': user_id, 'name': name, 'role': role})
            socketio.emit('users_online', list(active_users.values()))
            return  # نجح، اخرج من الدالة
            
        except sqlite3.OperationalError as e:
            if 'locked' in str(e).lower() and retry_count < max_retries - 1:
                retry_count += 1
                time.sleep(0.05 * retry_count)  # انتظار متزايد
                continue
            else:
                print(f'Database locked error in handle_register (attempt {retry_count + 1}): {e}')
                socketio.emit('error', {'message': 'حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.'})
                return
        except Exception as e:
            print(f'Error in handle_register: {e}')
            import traceback
            traceback.print_exc()
            socketio.emit('error', {'message': 'حدث خطأ غير متوقع.'})
            return

@socketio.on('get_conversations')
def handle_get_conversations(data):
    user_id = data if isinstance(data, str) else data.get('userId')
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''SELECT c.*, 
            cu.name as customer_name,
            cu.phone as customer_phone,
            sr.name as sales_rep_name
            FROM conversations c
            LEFT JOIN users cu ON c.customer_id = cu.id
            LEFT JOIN users sr ON c.sales_rep_id = sr.id
            WHERE c.customer_id = ? OR c.sales_rep_id = ?
            ORDER BY c.updated_at DESC''', (user_id, user_id))
        conversations = [dict(row) for row in cursor.fetchall()]
        socketio.emit('conversations_list', conversations)
    except sqlite3.OperationalError as e:
        print(f'Database error in get_conversations: {e}')
        socketio.emit('error', {'message': 'حدث خطأ في جلب المحادثات'})
    except Exception as e:
        print(f'Error in get_conversations: {e}')
        
@socketio.on('join_conversation')
def handle_join_conversation(data):
    conversation_id = data if isinstance(data, str) else data.get('conversationId')
    join_room(conversation_id)
    active_conversations[request.sid] = conversation_id
    
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            # جلب الرسائل
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''SELECT m.*, u.name as sender_name, u.role as sender_role,
                p.name as product_name, p.description as product_description, 
                p.price as product_price, p.image_url as product_image_url,
                p.video_url as product_video_url, p.specifications as product_specifications
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                LEFT JOIN products p ON m.product_id = p.id
                WHERE m.conversation_id = ?
                ORDER BY m.created_at ASC''', (conversation_id,))
            messages = [dict(row) for row in cursor.fetchall()]
            
            # معالجة الرسائل وإضافة معلومات المنتج
            for msg in messages:
                if 'image_url' not in msg or msg['image_url'] is None:
                    msg['image_url'] = None
                
                # إضافة معلومات المنتج إذا كانت الرسالة تحتوي على منتج
                if msg.get('product_id') and msg.get('product_name'):
                    msg['product'] = {
                        'id': msg['product_id'],
                        'name': msg['product_name'],
                        'description': msg.get('product_description'),
                        'price': msg.get('product_price'),
                        'image_url': msg.get('product_image_url'),
                        'video_url': msg.get('product_video_url'),
                        'specifications': msg.get('product_specifications')
                    }
            
            socketio.emit('messages_history', messages)
            
            # تحديث حالة القراءة
            user = active_users.get(request.sid)
            if user:
                cursor.execute('''UPDATE messages SET read_status = 1 
                    WHERE conversation_id = ? AND sender_id != ? AND read_status = 0''',
                    (conversation_id, user['id']))
                conn.commit()
            
            return  # نجح، اخرج من الدالة
            
        except sqlite3.OperationalError as e:
            if 'locked' in str(e).lower() and retry_count < max_retries - 1:
                retry_count += 1
                time.sleep(0.05 * retry_count)
                continue
            else:
                print(f'Database error in join_conversation: {e}')
                socketio.emit('error', {'message': 'حدث خطأ غير متوقع'})

                return
        except Exception as e:
            print(f'Error in join_conversation: {e}')
            socketio.emit('error', {'message': 'حدث خطأ غير متوقع'})

            return

@socketio.on('send_message')
def handle_send_message(data):
    conversation_id = data.get('conversationId')
    message = data.get('message')
    sender_id = data.get('senderId')
    image_url = data.get('image_url')
    product_id = data.get('product_id')
    message_type = data.get('message_type', 'text')
    
    user = active_users.get(request.sid)
    sender_role = data.get('sender_role', '')
    
    # السماح للإدمن بإرسال رسائل حتى لو لم يكن مسجل في active_users
    if sender_role == 'admin':
        user = {'id': 'admin', 'name': 'الإدارة', 'role': 'admin'}
    elif not user or not conversation_id:
        return
    
    # التحقق من وجود محتوى (رسالة أو صورة أو منتج)
    if not message and not image_url and not product_id:
        return
    
    message_id = str(uuid.uuid4())
    final_message = message or (('[صورة]' if image_url else '[بطاقة منتج]') if product_id else '')
    image_data = image_url or None
    
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # إدراج المستخدم إذا كان admin
            if user['id'] == 'admin':
                cursor.execute('''INSERT OR REPLACE INTO users 
                    (id, name, role) VALUES (?, ?, ?)''',
                    ('admin', 'الإدارة', 'admin'))
            
            cursor.execute('''INSERT INTO messages 
                (id, conversation_id, sender_id, message, image_url, product_id, message_type) 
                VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (message_id, conversation_id, user['id'], final_message, image_data, product_id, message_type))
            
            # تحديث وقت المحادثة
            cursor.execute('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                          (conversation_id,))
            
            # تحديث آخر نشاط للمندوب
            if user['role'] == 'sales_rep':
                cursor.execute('UPDATE sales_reps SET last_activity = CURRENT_TIMESTAMP WHERE id = ?',
                              (user['id'],))
                # تحديث آخر نشاط للجلسة
                for sid, session in active_sessions.items():
                    if session['user_id'] == user['id'] and session.get('is_active'):
                        cursor.execute('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?',
                                     (sid,))
            
            conn.commit()
            
            # جلب الرسالة المحفوظة
            if product_id:
                # إذا كانت رسالة منتج، جلب معلومات المنتج
                cursor.execute('''SELECT m.*, u.name as sender_name, u.role as sender_role,
                    p.name as product_name, p.description as product_description, 
                    p.price as product_price, p.image_url as product_image_url,
                    p.video_url as product_video_url, p.specifications as product_specifications
                    FROM messages m
                    JOIN users u ON m.sender_id = u.id
                    LEFT JOIN products p ON m.product_id = p.id
                    WHERE m.id = ?''', (message_id,))
            else:
                cursor.execute('''SELECT m.*, u.name as sender_name, u.role as sender_role
                    FROM messages m
                    JOIN users u ON m.sender_id = u.id
                    WHERE m.id = ?''', (message_id,))
            saved_message = cursor.fetchone()
            
            if saved_message:
                message_dict = dict(saved_message)
                message_dict['image_url'] = image_data or message_dict.get('image_url') or None
                # إضافة معلومات المنتج إذا كانت موجودة
                if product_id and saved_message.get('product_name'):
                    message_dict['product'] = {
                        'id': product_id,
                        'name': saved_message.get('product_name'),
                        'description': saved_message.get('product_description'),
                        'price': saved_message.get('product_price'),
                        'image_url': saved_message.get('product_image_url'),
                        'video_url': saved_message.get('product_video_url'),
                        'specifications': saved_message.get('product_specifications')
                    }
                socketio.emit('new_message', message_dict, room=conversation_id)
            
            return  # نجح، اخرج من الدالة
            
        except sqlite3.OperationalError as e:
            if 'locked' in str(e).lower() and retry_count < max_retries - 1:
                retry_count += 1
                time.sleep(0.05 * retry_count)
                continue
            else:
                print(f'Database error in send_message (attempt {retry_count + 1}): {e}')
                socketio.emit('error', {'message': 'حدث خطأ في إرسال الرسالة. يرجى المحاولة مرة أخرى.'})
                return
        except Exception as e:
            print(f'Error in send_message: {e}')
            import traceback
            traceback.print_exc()
            socketio.emit('error', {'message': 'حدث خطأ غير متوقع في إرسال الرسالة.'})
            return

@socketio.on('leave_conversation')
def handle_leave_conversation(data):
    conversation_id = data if isinstance(data, str) else data.get('conversationId')
    if conversation_id:
        leave_room(conversation_id)
        if request.sid in active_conversations:
            del active_conversations[request.sid]

@socketio.on('typing')
def handle_typing(data):
    conversation_id = data.get('conversationId')
    is_typing = data.get('isTyping')
    user = active_users.get(request.sid)
    
    if user:
        socketio.emit('user_typing', {
            'userId': user['id'],
            'userName': user['name'],
            'isTyping': is_typing
        }, room=conversation_id, include_self=False)

def assign_sales_rep(conversation_id, customer_id):
    """تخصيص مندوب مبيعات للمحادثة"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''SELECT * FROM users 
        WHERE role = 'sales_rep' AND is_online = 1 LIMIT 1''')
    rep = cursor.fetchone()
    
    if rep:
        rep_dict = dict(rep)
        rep_socket_id = next((sid for sid, u in active_users.items() 
                             if u['id'] == rep_dict['id']), None)
        
        if rep_socket_id:
            cursor.execute('''UPDATE conversations 
                SET sales_rep_id = ?, status = 'active' WHERE id = ?''',
                (rep_dict['id'], conversation_id))
            
            # إزالة من قائمة الانتظار
            waiting_customers[:] = [w for w in waiting_customers 
                                  if w['conversationId'] != conversation_id]
            
            socketio.emit('new_conversation_assigned', {
                'conversationId': conversation_id,
                'customerId': customer_id
            }, room=rep_socket_id)
            
            customer_socket_id = next((sid for sid, u in active_users.items() 
                                      if u['id'] == customer_id), None)
            if customer_socket_id:
                socketio.emit('sales_rep_assigned', {
                    'conversationId': conversation_id,
                    'salesRepId': rep_dict['id'],
                    'salesRepName': rep_dict['name']
                }, room=customer_socket_id)
            
            socketio.emit('waiting_customers_update', len(waiting_customers))
    
    conn.commit()

def assign_waiting_customers(rep_socket_id, rep_id):
    """تخصيص عملاء منتظرين للمندوب"""
    if not waiting_customers:
        return
    
    waiting = waiting_customers.pop(0)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''UPDATE conversations 
        SET sales_rep_id = ?, status = 'active' WHERE id = ?''',
        (rep_id, waiting['conversationId']))
    
    socketio.emit('new_conversation_assigned', {
        'conversationId': waiting['conversationId'],
        'customerId': waiting['customerId']
    }, room=rep_socket_id)
    
    customer_socket_id = next((sid for sid, u in active_users.items() 
                              if u['id'] == waiting['customerId']), None)
    if customer_socket_id:
        rep = active_users.get(rep_socket_id)
        if rep:
            socketio.emit('sales_rep_assigned', {
                'conversationId': waiting['conversationId'],
                'salesRepId': rep['id'],
                'salesRepName': rep['name']
            }, room=customer_socket_id)
    
    socketio.emit('waiting_customers_update', len(waiting_customers))
    conn.commit()

# Serve static files - يجب أن تكون في النهاية بعد جميع API routes
@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

# خدمة الملفات المرفوعة
@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    """خدمة الملفات المرفوعة"""
    try:
        return send_from_directory(UPLOAD_FOLDER, filename)
    except Exception as e:
        print(f'Error serving uploaded file: {e}')
        return jsonify({'error': 'File not found'}), 404

# هذا route يجب أن يكون في النهاية لعدم اعتراض API routes
@app.route('/<path:path>')
def serve_static(path):
    # تجنب اعتراض API routes
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    # منع الوصول إلى مجلد uploads من هنا (يتم التعامل معه في route منفصل)
    if path.startswith('uploads/'):
        return jsonify({'error': 'Not found'}), 404
    try:
        return send_from_directory('public', path)
    except Exception as e:
        print(f'Error serving static file: {e}')
        return jsonify({'error': 'File not found'}), 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    print(f'الخادم يعمل على المنفذ {port}')
    print(f'✅ API Routes متاحة على: http://localhost:{port}/api/')
    print(f'✅ Admin Panel: http://localhost:{port}/admin.html')
    socketio.run(app, host='0.0.0.0', port=port, debug=debug, log_output=debug)
