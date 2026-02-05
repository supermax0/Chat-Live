const socket = io({ transports: ['websocket', 'polling'] });
let isAdminLoggedIn = false;
let currentViewingConversationId = null;

// تعريف العناصر بعد تحميل الصفحة
let loginScreen, adminContainer, loginForm, adminUsername, adminPassword, logoutBtn;
let addRepForm, newRepName, newRepUsername, newRepPassword, addRepMessage;
let repsTableBody, searchReps, notificationContainer;
let totalReps, onlineReps, waitingCustomers, activeConversations;
let adminSidebar, navItems, pageContents, pageTitle, mobileMenuToggle, sidebarToggle;
let addProductBtn, productModal, productForm, productsGrid, addRepBtn, cancelAddRep;
let currentPage = 'dashboard';

// تهيئة العناصر
function initializeElements() {
    loginScreen = document.getElementById('loginScreen');
    adminContainer = document.getElementById('adminContainer');
    loginForm = document.getElementById('loginForm');
    adminUsername = document.getElementById('adminUsername');
    adminPassword = document.getElementById('adminPassword');
    logoutBtn = document.getElementById('logoutBtn');
    addRepForm = document.getElementById('addRepForm');
    newRepName = document.getElementById('newRepName');
    newRepUsername = document.getElementById('newRepUsername');
    newRepPassword = document.getElementById('newRepPassword');
    addRepMessage = document.getElementById('addRepMessage');
    repsTableBody = document.getElementById('repsTableBody');
    searchReps = document.getElementById('searchReps');
    notificationContainer = document.getElementById('notificationContainer');
    totalReps = document.getElementById('totalReps');
    onlineReps = document.getElementById('onlineReps');
    waitingCustomers = document.getElementById('waitingCustomers');
    activeConversations = document.getElementById('activeConversations');
    
    // عناصر الصفحات الجديدة
    adminSidebar = document.getElementById('adminSidebar');
    navItems = document.querySelectorAll('.nav-item');
    pageContents = document.querySelectorAll('.page-content');
    pageTitle = document.getElementById('pageTitle');
    mobileMenuToggle = document.getElementById('mobileMenuToggle');
    sidebarToggle = document.getElementById('sidebarToggle');
    addProductBtn = document.getElementById('addProductBtn');
    productModal = document.getElementById('productModal');
    productForm = document.getElementById('productForm');
    productsGrid = document.getElementById('productsGrid');
    addRepBtn = document.getElementById('addRepBtn');
    cancelAddRep = document.getElementById('cancelAddRep');
}

// معالج تسجيل الدخول
async function handleLogin(e) {
    e.preventDefault();
    const username = adminUsername.value.trim();
    const password = adminPassword.value.trim();
    
    if (!username || !password) {
        showNotification('يرجى إدخال اسم المستخدم وكلمة المرور', 'error');
        return;
    }
    
    try {
        console.log('Attempting login with:', { username, password: '***' });
        
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (response.ok && data.success) {
            // حفظ الجلسة في localStorage
            localStorage.setItem('adminSession', JSON.stringify({
                sessionId: data.sessionId,
                adminId: data.adminId,
                name: data.name,
                username: username,
                loginTime: new Date().toISOString()
            }));
            
            isAdminLoggedIn = true;
            loginScreen.classList.add('hidden');
            adminContainer.classList.remove('hidden');
            
            // تحميل البيانات
            loadStats();
            loadReps();
            loadSessions();
            loadProducts();
            
            // عرض الصفحة الرئيسية
            navigateToPage('dashboard');
            
            showNotification('تم تسجيل الدخول بنجاح', 'success');
            
            // التأكد من تحميل المندوبين بعد فترة قصيرة
            setTimeout(() => {
                if (repsTableBody && repsTableBody.children.length === 0) {
                    console.log('Table is empty, reloading reps...');
                    loadReps();
                }
            }, 500);
            
            // تحديث دورية
            if (!window.statsInterval) {
                window.statsInterval = setInterval(() => {
                    loadStats();
                    loadReps();
                    loadSessions();
                }, 5000);
                
                // تحديث آخر نشاط للجلسة بشكل دوري
                if (!window.sessionActivityInterval) {
                    window.sessionActivityInterval = setInterval(() => {
                        updateSessionActivity();
                    }, 30000); // كل 30 ثانية
                }
            }
        } else {
            const errorMsg = data.error || 'فشل تسجيل الدخول';
            showNotification(errorMsg, 'error');
            console.error('Login failed:', errorMsg);
            console.error('Full response:', { status: response.status, data });
        }
    } catch (error) {
        const errorMsg = 'حدث خطأ أثناء تسجيل الدخول: ' + error.message;
        showNotification(errorMsg, 'error');
        console.error('Login error:', error);
        console.error('Error stack:', error.stack);
    }
}

// معالج تسجيل الخروج
async function handleLogout() {
    // إغلاق الجلسة على السيرفر
    const session = getStoredSession();
    if (session && session.sessionId) {
        try {
            await fetch(`/api/admin/sessions/${session.sessionId}/logout`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Error logging out session:', error);
        }
    }
    
    // حذف الجلسة من localStorage
    localStorage.removeItem('adminSession');
    
    isAdminLoggedIn = false;
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (adminContainer) adminContainer.classList.add('hidden');
    if (adminUsername) adminUsername.value = '';
    if (adminPassword) adminPassword.value = '';
    
    // إيقاف التحديثات التلقائية
    if (window.statsInterval) {
        clearInterval(window.statsInterval);
        window.statsInterval = null;
    }
    
    if (window.sessionActivityInterval) {
        clearInterval(window.sessionActivityInterval);
        window.sessionActivityInterval = null;
    }
}

// الحصول على الجلسة المحفوظة
function getStoredSession() {
    try {
        const sessionData = localStorage.getItem('adminSession');
        return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
        console.error('Error reading session:', error);
        return null;
    }
}

// التحقق من الجلسة المحفوظة
async function checkStoredSession() {
    // إعادة تهيئة العناصر للتأكد من وجودها
    if (!loginScreen || !adminContainer) {
        console.log('Elements not ready, retrying...');
        setTimeout(() => checkStoredSession(), 100);
        return false;
    }
    
    const session = getStoredSession();
    
    if (!session || !session.sessionId) {
        console.log('No stored session found');
        return false;
    }
    
    console.log('Checking stored session:', session.sessionId);
    
    try {
        const response = await fetch(`/api/admin/sessions/${session.sessionId}/validate`);
        const data = await response.json();
        
        if (response.ok && data.valid) {
            console.log('Session is valid, auto-login...');
            // الجلسة صالحة، تسجيل الدخول تلقائياً
            isAdminLoggedIn = true;
            loginScreen.classList.add('hidden');
            adminContainer.classList.remove('hidden');
            loadStats();
            loadReps();
            loadSessions();
            loadProducts();
            navigateToPage('dashboard');
            
            // تحديث دورية
            if (!window.statsInterval) {
                window.statsInterval = setInterval(() => {
                    loadStats();
                    loadReps();
                    loadSessions();
                    updateSessionActivity();
                }, 5000);
                
                // تحديث آخر نشاط للجلسة بشكل دوري
                if (!window.sessionActivityInterval) {
                    window.sessionActivityInterval = setInterval(() => {
                        updateSessionActivity();
                    }, 30000); // كل 30 ثانية
                }
            }
            
            return true;
        } else {
            console.log('Session invalid, removing...');
            // الجلسة غير صالحة، حذفها
            localStorage.removeItem('adminSession');
            return false;
        }
    } catch (error) {
        console.error('Error validating session:', error);
        // في حالة الخطأ، نحاول استخدام الجلسة المحفوظة
        console.log('Using stored session despite error...');
        isAdminLoggedIn = true;
        loginScreen.classList.add('hidden');
        adminContainer.classList.remove('hidden');
        loadStats();
        loadReps();
        loadSessions();
        loadProducts();
        navigateToPage('dashboard');
        
        if (!window.statsInterval) {
            window.statsInterval = setInterval(() => {
                loadStats();
                loadReps();
                loadSessions();
                updateSessionActivity();
            }, 5000);
            
            // تحديث آخر نشاط للجلسة بشكل دوري
            if (!window.sessionActivityInterval) {
                window.sessionActivityInterval = setInterval(() => {
                    updateSessionActivity();
                }, 30000); // كل 30 ثانية
            }
        }
        return true;
    }
}

// تحديث آخر نشاط للجلسة
async function updateSessionActivity() {
    const session = getStoredSession();
    if (session && session.sessionId) {
        try {
            await fetch(`/api/sessions/${session.sessionId}/activity`, {
                method: 'POST'
            });
        } catch (error) {
            // في حالة الخطأ، نحاول إعادة التحقق من الجلسة
            const isValid = await checkStoredSession();
            if (!isValid) {
                // الجلسة انتهت، إعادة توجيه لتسجيل الدخول
                localStorage.removeItem('adminSession');
                location.reload();
            }
        }
    }
}

// معالج إضافة مندوب جديد
async function handleAddRep(e) {
    e.preventDefault();
    const name = newRepName.value.trim();
    const username = newRepUsername.value.trim();
    const password = newRepPassword.value.trim();
    
    if (!name || !username || !password) {
        showMessage('جميع الحقول مطلوبة', 'error');
        return;
    }
    
    if (password.length < 4) {
        showMessage('كلمة المرور يجب أن تكون 4 أحرف على الأقل', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/add-rep', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage('تم إضافة المندوب بنجاح', 'success');
            addRepForm.reset();
            loadReps();
            loadStats();
        } else {
            showMessage(data.error || 'فشل إضافة المندوب', 'error');
        }
    } catch (error) {
        showMessage('حدث خطأ أثناء إضافة المندوب', 'error');
        console.error(error);
    }
}

// معالج البحث في المندوبين
function handleSearchReps(e) {
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#repsTableBody tr');
    
    rows.forEach(row => {
        if (row.classList.contains('empty-state')) {
            return;
        }
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// تحميل الإحصائيات
async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const stats = await response.json();
        
        if (stats) {
            totalReps.textContent = stats.total_reps || 0;
            onlineReps.textContent = stats.online_reps || 0;
            waitingCustomers.textContent = stats.waiting_customers || 0;
            activeConversations.textContent = stats.active_conversations || 0;
        }
    } catch (error) {
        console.error('خطأ في تحميل الإحصائيات:', error);
    }
}

// تحميل قائمة المندوبين
async function loadReps() {
    try {
        console.log('Loading reps...');
        const response = await fetch('/api/admin/reps');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reps = await response.json();
        
        console.log('Reps received:', reps);
        console.log('Number of reps:', reps ? reps.length : 0);
        
        if (!repsTableBody) {
            console.error('repsTableBody element not found');
            return;
        }
        
        if (reps && Array.isArray(reps) && reps.length > 0) {
            console.log(`Rendering ${reps.length} reps`);
            renderRepsList(reps);
        } else {
            console.log('No reps found or empty array');
            repsTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">لا يوجد مندوبين حالياً</td></tr>';
        }
    } catch (error) {
        console.error('خطأ في تحميل المندوبين:', error);
        console.error('Error details:', error.message);
        if (repsTableBody) {
            repsTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">حدث خطأ في تحميل البيانات: ${error.message}</td></tr>`;
        }
    }
}

// عرض جدول المندوبين
function renderRepsList(reps) {
    if (!reps || !Array.isArray(reps) || reps.length === 0) {
        console.log('No reps to render or empty array');
        repsTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">لا يوجد مندوبين حالياً</td></tr>';
        return;
    }
    
    console.log(`Rendering ${reps.length} reps in table`);
    
    if (!repsTableBody) {
        console.error('repsTableBody is null!');
        return;
    }
    
    repsTableBody.innerHTML = reps.map(rep => {
        console.log('Processing rep:', rep.name, rep.username);
        const isOnline = rep.is_online === 1 || rep.is_online === true;
        const hasActiveConversations = rep.active_conversations > 0;
        const messagesToday = rep.messages_today || 0;
        const lastMessageTime = rep.last_message_time ? 
            new Date(rep.last_message_time).toLocaleTimeString('ar-SA', { 
                hour: '2-digit', 
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit'
            }) : '-';
        
        // حساب آخر نشاط
        const lastActivity = rep.last_activity ? 
            new Date(rep.last_activity).toLocaleString('ar-SA', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit'
            }) : '-';
        
        // تحديد حالة المندوب
        let statusText = 'غير متصل';
        let statusClass = 'status-offline';
        let statusIcon = '⚫';
        
        if (isOnline) {
            if (hasActiveConversations) {
                statusText = `نشط (${rep.active_conversations})`;
                statusClass = 'status-active';
                statusIcon = '🟢';
            } else {
                statusText = 'متصل';
                statusClass = 'status-online';
                statusIcon = '🟡';
            }
        }
        
        // تحديد التحذير
        const warningBadge = (!hasActiveConversations && isOnline) ? 
            '<span class="warning-badge" title="المندوب متصل ولكن لا يرد">⚠️</span>' : '';
        
        return `
            <tr class="rep-row ${isOnline ? 'online' : 'offline'}" data-rep-id="${rep.id}">
                <td>
                    <div class="rep-name-cell">
                        <strong>${escapeHtml(rep.name)}</strong>
                        ${warningBadge}
                    </div>
                </td>
                <td>@${escapeHtml(rep.username)}</td>
                <td>
                    <span class="status-badge ${statusClass}">
                        ${statusIcon} ${statusText}
                    </span>
                </td>
                <td class="text-center"><strong>${rep.active_conversations || 0}</strong></td>
                <td class="text-center"><strong>${messagesToday}</strong></td>
                <td class="text-muted">${lastActivity}</td>
                <td class="text-muted">${lastMessageTime}</td>
                <td>
                    <button class="btn-action btn-delete" onclick="deleteRep('${rep.id}', '${escapeHtml(rep.name)}')" title="حذف المندوب">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// تحميل الجلسات
async function loadSessions() {
    try {
        const response = await fetch('/api/admin/sessions');
        const sessions = await response.json();
        
        renderSessionsTable(sessions);
    } catch (error) {
        console.error('خطأ في تحميل الجلسات:', error);
    }
}

// عرض جدول الجلسات
function renderSessionsTable(sessions) {
    const sessionsTableBody = document.getElementById('sessionsTableBody');
    
    if (!sessions || sessions.length === 0) {
        sessionsTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">لا توجد جلسات نشطة</td></tr>';
        return;
    }
    
    sessionsTableBody.innerHTML = sessions.map(session => {
        const isActive = session.is_active === 1 || session.is_active === true;
        const loginTime = new Date(session.login_time).toLocaleString('ar-SA');
        const lastActivity = session.last_activity ? 
            new Date(session.last_activity).toLocaleString('ar-SA') : loginTime;
        const logoutTime = session.logout_time ? 
            new Date(session.logout_time).toLocaleString('ar-SA') : '-';
        
        return `
            <tr class="session-row ${isActive ? 'active' : 'inactive'}">
                <td><strong>${escapeHtml(session.username)}</strong></td>
                <td>${session.user_type === 'admin' ? 'إدمن' : 'مندوب'}</td>
                <td class="text-muted">${loginTime}</td>
                <td class="text-muted">${lastActivity}</td>
                <td class="text-muted">${session.ip_address || '-'}</td>
                <td>
                    <span class="status-badge ${isActive ? 'status-online' : 'status-offline'}">
                        ${isActive ? '🟢 نشط' : '⚫ منتهي'}
                    </span>
                </td>
                <td>
                    ${isActive ? 
                        `<button class="btn-action btn-logout" onclick="logoutSession('${session.id}')" title="إغلاق الجلسة">🔒</button>` 
                        : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

// إغلاق جلسة
async function logoutSession(sessionId) {
    if (!confirm('هل أنت متأكد من إغلاق هذه الجلسة؟')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/sessions/${sessionId}/logout`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showNotification('تم إغلاق الجلسة بنجاح', 'success');
            loadSessions();
        } else {
            showNotification(data.error || 'فشل إغلاق الجلسة', 'error');
        }
    } catch (error) {
        showNotification('حدث خطأ أثناء إغلاق الجلسة', 'error');
        console.error(error);
    }
}

// جعل logoutSession متاحاً عالمياً
window.logoutSession = logoutSession;

// حذف مندوب
async function deleteRep(repId, repName) {
    if (!confirm(`هل أنت متأكد من حذف المندوب "${repName}"؟`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/rep/${repId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showNotification('تم حذف المندوب بنجاح', 'success');
            loadReps();
            loadStats();
        } else {
            showNotification(data.error || 'فشل حذف المندوب', 'error');
        }
    } catch (error) {
        showNotification('حدث خطأ أثناء حذف المندوب', 'error');
        console.error(error);
    }
}

// إظهار رسالة في قسم الإضافة
function showMessage(message, type = 'info') {
    addRepMessage.textContent = message;
    addRepMessage.className = `message-status ${type}`;
    
    setTimeout(() => {
        addRepMessage.textContent = '';
        addRepMessage.className = 'message-status';
    }, 3000);
}

// إظهار إشعار
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification-badge ${type}`;
    notification.textContent = message;
    notificationContainer.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideDown 0.4s ease-out reverse';
        setTimeout(() => notification.remove(), 400);
    }, 3000);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// التنقل بين الصفحات
function navigateToPage(page) {
    currentPage = page;
    
    // تحديث الصفحات
    pageContents.forEach(content => {
        content.classList.remove('active');
    });
    
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // تحديث القائمة
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });
    
    // تحديث العنوان
    const titles = {
        'dashboard': 'الصفحة الرئيسية',
        'reps': 'إدارة المندوبين',
        'products': 'إدارة المنتجات',
        'sessions': 'الجلسات النشطة',
        'customers': 'العملاء',
        'conversations': 'جميع المحادثات'
    };
    if (pageTitle) {
        pageTitle.textContent = titles[page] || 'لوحة التحكم';
    }
    
    // إغلاق الـ sidebar على الموبايل
    if (window.innerWidth <= 1024 && adminSidebar) {
        adminSidebar.classList.remove('active');
    }
    
    // تحميل البيانات حسب الصفحة
    if (page === 'reps') {
        loadReps();
    } else if (page === 'products') {
        loadProducts();
    } else if (page === 'sessions') {
        loadSessions();
    } else if (page === 'customers') {
        loadCustomers();
    } else if (page === 'conversations') {
        loadAllConversations();
    } else if (page === 'dashboard') {
        loadStats();
    }
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    if (addRepForm) {
        addRepForm.addEventListener('submit', handleAddRep);
    }
    
    if (searchReps) {
        searchReps.addEventListener('input', handleSearchReps);
    }
    
    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) {
                navigateToPage(page);
            }
        });
    });
    
    // Mobile menu toggle
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
            if (adminSidebar) {
                adminSidebar.classList.toggle('active');
            }
        });
    }
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            if (adminSidebar) {
                adminSidebar.classList.toggle('active');
            }
        });
    }
    
    // إغلاق sidebar عند النقر خارجها
    document.addEventListener('click', (e) => {
        if (adminSidebar && window.innerWidth <= 1024) {
            if (!adminSidebar.contains(e.target) && 
                !mobileMenuToggle.contains(e.target) &&
                adminSidebar.classList.contains('active')) {
                adminSidebar.classList.remove('active');
            }
        }
    });
    
    // Products
    if (addProductBtn) {
        addProductBtn.addEventListener('click', () => {
            openProductModal();
        });
    }
    
    if (productForm) {
        productForm.addEventListener('submit', handleProductSubmit);
    }
    
    const closeProductModal = document.getElementById('closeProductModal');
    const cancelProductBtn = document.getElementById('cancelProductBtn');
    
    if (closeProductModal) {
        closeProductModal.addEventListener('click', closeProductModalFunc);
    }
    
    if (cancelProductBtn) {
        cancelProductBtn.addEventListener('click', closeProductModalFunc);
    }
    
    if (productModal) {
        productModal.addEventListener('click', (e) => {
            if (e.target === productModal) {
                closeProductModalFunc();
            }
        });
    }
    
    // معاينة الصورة عند اختيارها
    const productImageInput = document.getElementById('productImage');
    const imageUploadArea = document.getElementById('imageUploadArea');
    const imageUploadPlaceholder = document.getElementById('imageUploadPlaceholder');
    const imagePreview = document.getElementById('productImagePreview');
    const removeImagePreview = document.getElementById('removeImagePreview');
    
    if (imageUploadArea && imageUploadPlaceholder) {
        // النقر على منطقة الرفع
        imageUploadArea.addEventListener('click', () => {
            if (productImageInput) productImageInput.click();
        });
        
        // السحب والإفلات
        imageUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageUploadArea.classList.add('drag-over');
        });
        
        imageUploadArea.addEventListener('dragleave', () => {
            imageUploadArea.classList.remove('drag-over');
        });
        
        imageUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            imageUploadArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('image/')) {
                productImageInput.files = files;
                handleImagePreview(files[0]);
            }
        });
    }
    
    function handleImagePreview(file) {
        if (file.size > 10 * 1024 * 1024) {
            showNotification('حجم الصورة كبير جداً (الحد الأقصى 10MB)', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            if (imagePreview && imageUploadPlaceholder) {
                const img = document.getElementById('productImagePreviewImg');
                if (img) {
                    img.src = e.target.result;
                    imagePreview.style.display = 'block';
                    imageUploadPlaceholder.style.display = 'none';
                }
            }
        };
        reader.readAsDataURL(file);
    }
    
    if (productImageInput) {
        productImageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                handleImagePreview(file);
            }
        });
    }
    
    if (removeImagePreview) {
        removeImagePreview.addEventListener('click', (e) => {
            e.stopPropagation();
            if (productImageInput) productImageInput.value = '';
            if (imagePreview) imagePreview.style.display = 'none';
            if (imageUploadPlaceholder) imageUploadPlaceholder.style.display = 'block';
        });
    }
    
    // معاينة الفيديو عند اختياره
    const productVideoInput = document.getElementById('productVideo');
    const videoUploadArea = document.getElementById('videoUploadArea');
    const videoUploadPlaceholder = document.getElementById('videoUploadPlaceholder');
    const videoPreview = document.getElementById('productVideoPreview');
    const removeVideoPreview = document.getElementById('removeVideoPreview');
    
    if (videoUploadArea && videoUploadPlaceholder) {
        // النقر على منطقة الرفع
        videoUploadArea.addEventListener('click', () => {
            if (productVideoInput) productVideoInput.click();
        });
        
        // السحب والإفلات
        videoUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            videoUploadArea.classList.add('drag-over');
        });
        
        videoUploadArea.addEventListener('dragleave', () => {
            videoUploadArea.classList.remove('drag-over');
        });
        
        videoUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            videoUploadArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('video/')) {
                productVideoInput.files = files;
                handleVideoPreview(files[0]);
            }
        });
    }
    
    function handleVideoPreview(file) {
        if (file.size > 10 * 1024 * 1024) {
            showNotification('حجم الفيديو كبير جداً (الحد الأقصى 10MB)', 'error');
            return;
        }
        
        const url = URL.createObjectURL(file);
        const video = document.getElementById('productVideoPreviewVideo');
        const source = document.getElementById('productVideoPreviewSource');
        if (videoPreview && videoUploadPlaceholder && video && source) {
            source.src = url;
            video.load();
            videoPreview.style.display = 'block';
            videoUploadPlaceholder.style.display = 'none';
        }
    }
    
    if (productVideoInput) {
        productVideoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                handleVideoPreview(file);
            }
        });
    }
    
    if (removeVideoPreview) {
        removeVideoPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            if (productVideoInput) productVideoInput.value = '';
            if (videoPreview) videoPreview.style.display = 'none';
            if (videoUploadPlaceholder) videoUploadPlaceholder.style.display = 'block';
        });
    }
    
    // Add Rep Button
    if (addRepBtn) {
        addRepBtn.addEventListener('click', () => {
            if (addRepForm) {
                addRepForm.classList.remove('hidden');
            }
        });
    }
    
    if (cancelAddRep) {
        cancelAddRep.addEventListener('click', () => {
            if (addRepForm) {
                addRepForm.classList.add('hidden');
                addRepForm.reset();
            }
        });
    }
    
    // حفظ الجلسة عند إغلاق الصفحة
    window.addEventListener('beforeunload', () => {
        updateSessionActivity();
    });
}

// إدارة المنتجات
async function loadProducts() {
    try {
        const response = await fetch('/api/admin/products');
        const products = await response.json();
        
        if (productsGrid) {
            if (products.length === 0) {
                productsGrid.innerHTML = '<p class="empty-state">لا توجد منتجات حالياً</p>';
                return;
            }
            
            productsGrid.innerHTML = products.map(product => `
                <div class="product-card">
                    <div class="product-image-container">
                        ${product.image_url ? 
                            `<img src="${product.image_url}" alt="${product.name}" class="product-image" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'product-image-placeholder\\'>📦</div>'">` : 
                            `<div class="product-image-placeholder">📦</div>`
                        }
                    </div>
                    <div class="product-body">
                        <h3 class="product-name">${escapeHtml(product.name)}</h3>
                        ${product.description ? `<p class="product-description">${escapeHtml(product.description)}</p>` : '<p class="product-description" style="color: var(--text-light); font-style: italic;">لا يوجد وصف</p>'}
                        ${product.price ? `
                            <div class="product-price-container">
                                <span class="product-price">${product.price}</span>
                                <span class="product-price-currency">ر.س</span>
                            </div>
                        ` : `
                            <div class="product-price-container">
                                <span class="product-price" style="font-size: 18px; color: var(--text-secondary);">غير محدد</span>
                            </div>
                        `}
                        <div class="product-actions">
                            <button class="btn btn-primary" onclick="editProduct('${product.id}')">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                تعديل
                            </button>
                            <button class="btn btn-secondary" onclick="deleteProduct('${product.id}')">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                                حذف
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

function openProductModal(product = null) {
    if (productModal) {
        const title = document.getElementById('productModalTitle');
        const form = document.getElementById('productForm');
        const productId = document.getElementById('productId');
        const imagePreview = document.getElementById('productImagePreview');
        const videoPreview = document.getElementById('productVideoPreview');
        
        if (product) {
            if (title) title.textContent = 'تعديل منتج';
            if (productId) productId.value = product.id;
            if (document.getElementById('productName')) document.getElementById('productName').value = product.name || '';
            if (document.getElementById('productDescription')) document.getElementById('productDescription').value = product.description || '';
            if (document.getElementById('productPrice')) document.getElementById('productPrice').value = product.price || '';
            if (document.getElementById('productImageUrl')) document.getElementById('productImageUrl').value = product.image_url || '';
            if (document.getElementById('productVideoUrl')) document.getElementById('productVideoUrl').value = product.video_url || '';
            if (document.getElementById('productSpecifications')) document.getElementById('productSpecifications').value = product.specifications || '';
            
            // عرض معاينة الصورة والفيديو
            const imageUploadPlaceholder = document.getElementById('imageUploadPlaceholder');
            const videoUploadPlaceholder = document.getElementById('videoUploadPlaceholder');
            
            if (product.image_url && imagePreview && imageUploadPlaceholder) {
                const img = document.getElementById('productImagePreviewImg');
                if (img) {
                    img.src = product.image_url;
                    imagePreview.style.display = 'block';
                    imageUploadPlaceholder.style.display = 'none';
                }
            }
            if (product.video_url && videoPreview && videoUploadPlaceholder) {
                const video = document.getElementById('productVideoPreviewVideo');
                const source = document.getElementById('productVideoPreviewSource');
                if (video && source) {
                    source.src = product.video_url;
                    video.load();
                    videoPreview.style.display = 'block';
                    videoUploadPlaceholder.style.display = 'none';
                }
            }
        } else {
            if (title) title.textContent = 'إضافة منتج جديد';
            if (form) form.reset();
            if (productId) productId.value = '';
            const imageUploadPlaceholder = document.getElementById('imageUploadPlaceholder');
            const videoUploadPlaceholder = document.getElementById('videoUploadPlaceholder');
            if (imagePreview) imagePreview.style.display = 'none';
            if (videoPreview) videoPreview.style.display = 'none';
            if (imageUploadPlaceholder) imageUploadPlaceholder.style.display = 'block';
            if (videoUploadPlaceholder) videoUploadPlaceholder.style.display = 'block';
        }
        
        productModal.classList.add('active');
    }
}

function closeProductModalFunc() {
    if (productModal) {
        productModal.classList.remove('active');
        if (productForm) productForm.reset();
        const imagePreview = document.getElementById('productImagePreview');
        const videoPreview = document.getElementById('productVideoPreview');
        const imageUploadPlaceholder = document.getElementById('imageUploadPlaceholder');
        const videoUploadPlaceholder = document.getElementById('videoUploadPlaceholder');
        if (imagePreview) imagePreview.style.display = 'none';
        if (videoPreview) videoPreview.style.display = 'none';
        if (imageUploadPlaceholder) imageUploadPlaceholder.style.display = 'block';
        if (videoUploadPlaceholder) videoUploadPlaceholder.style.display = 'block';
    }
}

async function handleProductSubmit(e) {
    e.preventDefault();
    
    const productId = document.getElementById('productId').value;
    const formData = new FormData();
    
    formData.append('name', document.getElementById('productName').value);
    formData.append('description', document.getElementById('productDescription').value);
    formData.append('price', document.getElementById('productPrice').value || 0);
    formData.append('specifications', document.getElementById('productSpecifications').value);
    
    // إضافة الملفات
    const imageFile = document.getElementById('productImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    } else if (document.getElementById('productImageUrl').value) {
        formData.append('image_url', document.getElementById('productImageUrl').value);
    }
    
    const videoFile = document.getElementById('productVideo').files[0];
    if (videoFile) {
        formData.append('video', videoFile);
    } else if (document.getElementById('productVideoUrl').value) {
        formData.append('video_url', document.getElementById('productVideoUrl').value);
    }
    
    try {
        let response;
        if (productId) {
            response = await fetch(`/api/admin/products/${productId}`, {
                method: 'PUT',
                body: formData
            });
        } else {
            response = await fetch('/api/admin/products', {
                method: 'POST',
                body: formData
            });
        }
        
        if (response.ok) {
            showNotification(productId ? 'تم تحديث المنتج بنجاح' : 'تم إضافة المنتج بنجاح', 'success');
            closeProductModalFunc();
            loadProducts();
        } else {
            const error = await response.json();
            showNotification(error.error || 'حدث خطأ في حفظ المنتج', 'error');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        showNotification('حدث خطأ في حفظ المنتج', 'error');
    }
}

function editProduct(productId) {
    fetch(`/api/admin/products`)
        .then(res => res.json())
        .then(products => {
            const product = products.find(p => p.id === productId);
            if (product) {
                openProductModal(product);
            }
        })
        .catch(error => {
            console.error('Error loading product:', error);
            showNotification('حدث خطأ في تحميل المنتج', 'error');
        });
}

async function deleteProduct(productId) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/products/${productId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('تم حذف المنتج بنجاح', 'success');
            loadProducts();
        } else {
            showNotification('حدث خطأ في حذف المنتج', 'error');
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        showNotification('حدث خطأ في حذف المنتج', 'error');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// تحميل العملاء
async function loadCustomers() {
    try {
        const response = await fetch('/api/admin/customers');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const customers = await response.json();
        renderCustomersList(customers);
    } catch (error) {
        console.error('Error loading customers:', error);
        showNotification('حدث خطأ في تحميل العملاء', 'error');
    }
}

function renderCustomersList(customers) {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;
    
    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد عملاء حالياً</td></tr>';
        return;
    }
    
    tbody.innerHTML = customers.map(customer => {
        const createdDate = new Date(customer.created_at).toLocaleDateString('ar-SA');
        const lastConv = customer.last_conversation ? new Date(customer.last_conversation).toLocaleDateString('ar-SA') : '-';
        
        return `
            <tr>
                <td>${escapeHtml(customer.name || 'غير محدد')}</td>
                <td>${escapeHtml(customer.phone || '-')}</td>
                <td>${customer.total_conversations || 0}</td>
                <td>${customer.active_conversations || 0}</td>
                <td>${createdDate}</td>
                <td>${lastConv}</td>
            </tr>
        `;
    }).join('');
}

// تحميل جميع المحادثات
async function loadAllConversations() {
    try {
        const response = await fetch('/api/admin/conversations');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const conversations = await response.json();
        renderConversationsList(conversations);
    } catch (error) {
        console.error('Error loading conversations:', error);
        showNotification('حدث خطأ في تحميل المحادثات', 'error');
    }
}

function renderConversationsList(conversations) {
    const tbody = document.getElementById('conversationsTableBody');
    if (!tbody) return;
    
    if (conversations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">لا توجد محادثات حالياً</td></tr>';
        return;
    }
    
    tbody.innerHTML = conversations.map(conv => {
        const createdDate = new Date(conv.created_at).toLocaleDateString('ar-SA');
        const lastMsg = conv.last_message_time ? new Date(conv.last_message_time).toLocaleDateString('ar-SA') : '-';
        const statusText = {
            'waiting': 'في الانتظار',
            'active': 'نشطة',
            'closed': 'مغلقة'
        }[conv.status] || conv.status;
        
        return `
            <tr>
                <td>${escapeHtml(conv.customer_name || 'غير محدد')}</td>
                <td>${escapeHtml(conv.customer_phone || '-')}</td>
                <td>${escapeHtml(conv.sales_rep_name || 'غير محدد')}</td>
                <td><span class="status-badge status-${conv.status}">${statusText}</span></td>
                <td>${conv.message_count || 0}</td>
                <td>${createdDate}</td>
                <td>${lastMsg}</td>
                <td>
                    <button class="btn btn-small btn-primary" onclick="viewConversation('${conv.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        عرض
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// البحث في العملاء
const searchCustomersInput = document.getElementById('searchCustomers');
if (searchCustomersInput) {
    searchCustomersInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#customersTableBody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    });
}

// البحث في المحادثات
const searchConversationsInput = document.getElementById('searchConversations');
if (searchConversationsInput) {
    searchConversationsInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#conversationsTableBody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    });
}

// عرض المحادثة
async function viewConversation(conversationId) {
    currentViewingConversationId = conversationId;
    const modal = document.getElementById('conversationModal');
    const messagesContainer = document.getElementById('conversationMessagesContainer');
    
    if (!modal || !messagesContainer) return;
    
    // إظهار النافذة
    modal.classList.add('active');
    messagesContainer.innerHTML = '<div class="empty-state">جاري تحميل الرسائل...</div>';
    
    try {
        // جلب معلومات المحادثة
        const convResponse = await fetch('/api/admin/conversations');
        const conversations = await convResponse.json();
        const conversation = conversations.find(c => c.id === conversationId);
        
        if (conversation) {
            document.getElementById('conversationCustomerName').textContent = conversation.customer_name || '-';
            document.getElementById('conversationCustomerPhone').textContent = conversation.customer_phone || '-';
            document.getElementById('conversationRepName').textContent = conversation.sales_rep_name || 'غير محدد';
            const statusText = {
                'waiting': 'في الانتظار',
                'active': 'نشطة',
                'closed': 'مغلقة'
            }[conversation.status] || conversation.status;
            document.getElementById('conversationStatus').textContent = statusText;
        }
        
        // جلب الرسائل
        const messagesResponse = await fetch(`/api/admin/conversations/${conversationId}/messages`);
        if (!messagesResponse.ok) {
            throw new Error('فشل تحميل الرسائل');
        }
        const messages = await messagesResponse.json();
        
        // عرض الرسائل
        renderConversationMessages(messages);
        
        // الانضمام إلى room المحادثة
        socket.emit('join_conversation', conversationId);
        
    } catch (error) {
        console.error('Error loading conversation:', error);
        messagesContainer.innerHTML = '<div class="empty-state error">حدث خطأ في تحميل المحادثة</div>';
        showNotification('حدث خطأ في تحميل المحادثة', 'error');
    }
}

function renderConversationMessages(messages) {
    const container = document.getElementById('conversationMessagesContainer');
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="empty-state">لا توجد رسائل في هذه المحادثة</div>';
        return;
    }
    
    container.innerHTML = messages.map(message => {
        const isAdmin = message.sender_role === 'admin';
        const isCustomer = message.sender_role === 'customer';
        const isRep = message.sender_role === 'sales_rep';
        const isAi = message.sender_role === 'ai_agent';
        const timestamp = new Date(message.created_at).toLocaleString('ar-SA');
        
        let content = escapeHtml(message.message || '');
        
        // دعم بطاقات المنتجات
        if (message.product || message.product_id) {
            const product = message.product;
            if (product) {
                content = `
                    <div class="product-card-message">
                        ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" class="product-card-image" onerror="this.style.display='none'">` : ''}
                        <div class="product-card-content">
                            <h4 class="product-card-name">${escapeHtml(product.name)}</h4>
                            ${product.description ? `<p class="product-card-description">${escapeHtml(product.description.substring(0, 80))}${product.description.length > 80 ? '...' : ''}</p>` : ''}
                            ${product.price ? `<div class="product-card-price">${product.price} ر.س</div>` : ''}
                        </div>
                    </div>
                `;
            }
        }
        
        // دعم الصور
        if (message.image_url) {
            content = `<img src="${message.image_url}" alt="صورة" class="image-preview" style="max-width: 200px; border-radius: 8px;">`;
        }
        
        return `
            <div class="admin-message ${isAdmin ? 'admin-sent' : isRep ? 'rep-message' : isAi ? 'ai-message' : 'customer-message'}">
                <div class="message-header">
                    <span class="sender-name">${escapeHtml(message.sender_name || (isAi ? 'وكيل المبيعات الذكي' : 'غير محدد'))}</span>
                    <span class="message-time">${timestamp}</span>
                </div>
                <div class="message-content">${content}</div>
            </div>
        `;
    }).join('');
    
    // التمرير للأسفل
    container.scrollTop = container.scrollHeight;
}

// إغلاق نافذة المحادثة
function closeConversationModal() {
    const modal = document.getElementById('conversationModal');
    if (modal) {
        modal.classList.remove('active');
        if (currentViewingConversationId) {
            socket.emit('leave_conversation', currentViewingConversationId);
            currentViewingConversationId = null;
        }
    }
}

// إرسال رسالة من الإدمن
async function sendAdminMessage() {
    if (!currentViewingConversationId) return;
    
    const input = document.getElementById('adminMessageInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    try {
        socket.emit('send_message', {
            conversationId: currentViewingConversationId,
            senderId: 'admin',
            message: message,
            sender_role: 'admin'
        });
        
        input.value = '';
        
        // إعادة تحميل الرسائل
        setTimeout(() => {
            viewConversation(currentViewingConversationId);
        }, 500);
        
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('حدث خطأ في إرسال الرسالة', 'error');
    }
}

// استقبال رسائل جديدة
socket.on('new_message', (message) => {
    if (currentViewingConversationId && message.conversation_id === currentViewingConversationId) {
        // إعادة تحميل الرسائل
        viewConversation(currentViewingConversationId);
    }
});

// إعداد مستمعي الأحداث للمحادثة عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeConversationModal');
    const sendBtn = document.getElementById('adminSendMessageBtn');
    const messageInput = document.getElementById('adminMessageInput');
    const modal = document.getElementById('conversationModal');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeConversationModal);
    }
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendAdminMessage);
    }
    
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendAdminMessage();
            }
        });
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeConversationModal();
            }
        });
    }
});

// جعل الدوال متاحة عالمياً
window.viewConversation = viewConversation;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;

// تهيئة الصفحة عند التحميل
window.addEventListener('DOMContentLoaded', async () => {
    initializeElements();
    
    // إعداد مستمعي الأحداث
    setupEventListeners();
    
    // التحقق من الجلسة المحفوظة بعد تهيئة كل شيء
    // استخدام setTimeout للتأكد من أن كل شيء جاهز
    setTimeout(async () => {
        await checkStoredSession();
    }, 100);
});

// أيضاً التحقق عند تحميل الصفحة مباشرة (في حالة كان DOM جاهزاً)
if (document.readyState !== 'loading') {
    // DOM جاهز بالفعل
    initializeElements();
    setupEventListeners();
    setTimeout(async () => {
        await checkStoredSession();
    }, 100);
}

// جعل deleteRep متاحاً عالمياً
window.deleteRep = deleteRep;
