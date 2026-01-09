const socket = io({ transports: ['websocket', 'polling'] });
let currentRepId = null;
let currentConversationId = null;
let conversations = [];
let typingTimer = null;

const loginScreen = document.getElementById('loginScreen');
const dashboardContainer = document.getElementById('dashboardContainer');
const loginForm = document.getElementById('loginForm');
const repNameInput = document.getElementById('repUsername');
const conversationsList = document.getElementById('conversationsList');
const chatPlaceholder = document.getElementById('chatPlaceholder');
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const chatTitle = document.getElementById('chatTitle');
const typingIndicator = document.getElementById('typingIndicator');
const waitingCount = document.getElementById('waitingCount');
const activeChatsCount = document.getElementById('activeChatsCount');
const messagesToday = document.getElementById('messagesToday');
const searchConversations = document.getElementById('searchConversations');
const filterStatus = document.getElementById('filterStatus');
const sortBy = document.getElementById('sortBy');
const customerDetails = document.getElementById('customerDetails');
const customerStatusDot = document.getElementById('customerStatusDot');
const customerStatusText = document.getElementById('customerStatusText');
const markReadBtn = document.getElementById('markReadBtn');
const fileUploadBtn = document.getElementById('fileUploadBtn');
const fileInput = document.getElementById('fileInput');
const emojiBtn = document.getElementById('emojiBtn');
const notificationContainer = document.getElementById('notificationContainer');
const conversationsSidebar = document.getElementById('conversationsSidebar');
const chatPanel = document.getElementById('chatPanel');
const backButton = document.getElementById('backButton');
const sendProductBtn = document.getElementById('sendProductBtn');
const productSelectModal = document.getElementById('productSelectModal');
const productsSelectList = document.getElementById('productsSelectList');
const searchProducts = document.getElementById('searchProducts');
const closeProductSelectModal = document.getElementById('closeProductSelectModal');
let products = [];

// إشعارات صوتية
const playNotificationSound = () => {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjGH0fPTgjMGHm7A7+OZUBALSKLh8sBwJgU1idTz1oU5Bx5pve3k');
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
};

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

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = repNameInput.value.trim();
    const password = document.getElementById('repPassword').value.trim();
    
    if (!username || !password) {
        showNotification('يرجى إدخال اسم المستخدم وكلمة المرور', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/rep/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // حفظ الجلسة في localStorage
            localStorage.setItem('repSession', JSON.stringify({
                sessionId: data.sessionId,
                repId: data.repId,
                name: data.name,
                username: data.username,
                loginTime: new Date().toISOString()
            }));
            
            currentRepId = data.repId;
            socket.emit('register', {
                id: data.repId,
                name: data.name,
                role: 'sales_rep'
            });
        } else {
            showNotification(data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
        }
    } catch (error) {
        showNotification('حدث خطأ أثناء تسجيل الدخول', 'error');
        console.error(error);
    }
});

socket.on('registered', (data) => {
    currentRepId = data.userId;
    loginScreen.classList.add('hidden');
    dashboardContainer.classList.remove('hidden');
    
    // على الشاشات الصغيرة: التأكد من إظهار القائمة في البداية
    if (window.innerWidth <= 768) {
        conversationsSidebar.classList.remove('hidden');
        chatPanel.classList.remove('active');
    }
    
    loadConversations();
    
    // تحديث آخر نشاط للجلسة
    updateRepSessionActivity();
});

// الحصول على الجلسة المحفوظة للمندوب
function getStoredRepSession() {
    try {
        const sessionData = localStorage.getItem('repSession');
        return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
        console.error('Error reading rep session:', error);
        return null;
    }
}

// التحقق من الجلسة المحفوظة للمندوب
async function checkStoredRepSession() {
    // إعادة تهيئة العناصر للتأكد من وجودها
    if (!loginScreen || !dashboardContainer || !conversationsSidebar || !chatPanel) {
        console.log('Elements not ready, retrying...');
        setTimeout(() => checkStoredRepSession(), 100);
        return false;
    }
    
    const session = getStoredRepSession();
    
    if (!session || !session.sessionId) {
        console.log('No stored rep session found');
        return false;
    }
    
    console.log('Checking stored rep session:', session.sessionId);
    
    try {
        const response = await fetch(`/api/rep/sessions/${session.sessionId}/validate`);
        const data = await response.json();
        
        if (response.ok && data.valid) {
            console.log('Rep session is valid, auto-login...');
            // الجلسة صالحة، تسجيل الدخول تلقائياً
            currentRepId = data.session.userId;
            loginScreen.classList.add('hidden');
            dashboardContainer.classList.remove('hidden');
            
            // على الشاشات الصغيرة: التأكد من إظهار القائمة في البداية
            if (window.innerWidth <= 768) {
                conversationsSidebar.classList.remove('hidden');
                chatPanel.classList.remove('active');
            }
            
            // تسجيل الدخول في Socket.IO
            socket.emit('register', {
                id: data.session.userId,
                name: data.session.name,
                role: 'sales_rep'
            });
            
            loadConversations();
            
            // تحديث دورية للجلسة
            if (!window.repSessionInterval) {
                window.repSessionInterval = setInterval(() => {
                    updateRepSessionActivity();
                }, 30000); // كل 30 ثانية
            }
            
            return true;
        } else {
            console.log('Rep session invalid, removing...');
            // الجلسة غير صالحة، حذفها
            localStorage.removeItem('repSession');
            return false;
        }
    } catch (error) {
        console.error('Error validating rep session:', error);
        // في حالة الخطأ، نحاول الاستمرار بالجلسة المحفوظة
        if (session && session.repId) {
            console.log('Using stored rep session despite error...');
            currentRepId = session.repId;
            loginScreen.classList.add('hidden');
            dashboardContainer.classList.remove('hidden');
            
            if (window.innerWidth <= 768) {
                conversationsSidebar.classList.remove('hidden');
                chatPanel.classList.remove('active');
            }
            
            socket.emit('register', {
                id: session.repId,
                name: session.name,
                role: 'sales_rep'
            });
            
            loadConversations();
            
            // تحديث دورية للجلسة
            if (!window.repSessionInterval) {
                window.repSessionInterval = setInterval(() => {
                    updateRepSessionActivity();
                }, 30000);
            }
            
            return true;
        }
        return false;
    }
}

// تحديث آخر نشاط للجلسة
async function updateRepSessionActivity() {
    const session = getStoredRepSession();
    if (session && session.sessionId) {
        try {
            await fetch(`/api/sessions/${session.sessionId}/activity`, {
                method: 'POST'
            });
        } catch (error) {
            // في حالة الخطأ، نحاول إعادة التحقق من الجلسة
            const isValid = await checkStoredRepSession();
            if (!isValid) {
                // الجلسة انتهت، إعادة توجيه لتسجيل الدخول
                localStorage.removeItem('repSession');
                location.reload();
            }
        }
    }
}

// تسجيل الخروج للمندوب
async function logoutRep() {
    if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        return;
    }
    
    // إغلاق الجلسة على السيرفر
    const session = getStoredRepSession();
    if (session && session.sessionId) {
        try {
            await fetch(`/api/admin/sessions/${session.sessionId}/logout`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('Error logging out session:', error);
        }
    }
    
    // قطع الاتصال من Socket.IO
    socket.disconnect();
    
    // حذف الجلسة من localStorage
    localStorage.removeItem('repSession');
    
    // إعادة التوجيه لتسجيل الدخول
    location.reload();
}

// جعل logoutRep متاحاً عالمياً
window.logoutRep = logoutRep;

// تهيئة الصفحة عند التحميل
// إعداد مستمعي الأحداث للمنتجات
if (sendProductBtn) {
    sendProductBtn.addEventListener('click', openProductSelectModal);
}

if (closeProductSelectModal) {
    closeProductSelectModal.addEventListener('click', closeProductSelectModalFunc);
}

if (productSelectModal) {
    productSelectModal.addEventListener('click', (e) => {
        if (e.target === productSelectModal) {
            closeProductSelectModalFunc();
        }
    });
}

if (searchProducts) {
    searchProducts.addEventListener('input', (e) => {
        renderProductsList(e.target.value);
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    // التحقق من الجلسة المحفوظة بعد تهيئة كل شيء
    setTimeout(async () => {
        await checkStoredRepSession();
    }, 100);
    
    // حفظ الجلسة عند إغلاق الصفحة
    window.addEventListener('beforeunload', () => {
        updateRepSessionActivity();
    });
});

// أيضاً التحقق عند تحميل الصفحة مباشرة (في حالة كان DOM جاهزاً)
if (document.readyState === 'loading') {
    // DOM لم يتم تحميله بعد، سيتم استدعاؤه في DOMContentLoaded
} else {
    // DOM جاهز بالفعل
    setTimeout(async () => {
        await checkStoredRepSession();
    }, 100);
}

socket.on('waiting_customers_update', (count) => {
    if (waitingCount) {
        waitingCount.textContent = count;
        // إضافة تأثير عند تغيير العدد
        if (count > 0) {
            waitingCount.parentElement.classList.add('pulse');
            setTimeout(() => {
                waitingCount.parentElement.classList.remove('pulse');
            }, 1000);
        }
    }
});

socket.on('new_conversation_assigned', (data) => {
    loadConversations();
    playNotificationSound();
    showNotification('محادثة جديدة مخصصة لك!', 'success');
    if (!currentConversationId) {
        selectConversation(data.conversationId);
    }
});

socket.on('conversations_list', (data) => {
    conversations = data;
    renderConversationsList();
    updateActiveChatsCount();
});

// تحديث الإحصائيات بشكل دوري
setInterval(() => {
    if (currentRepId) {
        updateActiveChatsCount();
    }
}, 30000); // كل 30 ثانية

socket.on('messages_history', (messages) => {
    chatMessages.innerHTML = '';
    messages.forEach(message => {
        addMessageToChat(message);
    });
    scrollToBottom();
});

socket.on('new_message', (message) => {
    if (message.conversation_id === currentConversationId) {
        addMessageToChat(message);
        scrollToBottom();
        
        // تحديث حالة القراءة
        if (message.sender_id !== currentRepId) {
            socket.emit('mark_read', { conversationId: currentConversationId });
        }
    } else {
        // تحديث عدد الرسائل غير المقروءة
        updateConversationBadge(message.conversation_id);
        playNotificationSound();
        if (!document.hasFocus()) {
            showNotification('رسالة جديدة من ' + (message.sender_name || 'عميل'), 'info');
        }
    }
    loadConversations();
});

socket.on('user_typing', (data) => {
    if (data.isTyping && data.userId !== currentRepId && data.conversationId === currentConversationId) {
        typingIndicator.classList.remove('hidden');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            typingIndicator.classList.add('hidden');
        }, 3000);
    } else {
        typingIndicator.classList.add('hidden');
    }
});

function loadConversations() {
    if (currentRepId) {
        socket.emit('get_conversations', currentRepId);
    }
}

function renderConversationsList() {
    if (conversations.length === 0) {
        conversationsList.innerHTML = '<p class="empty-state">لا توجد محادثات حالياً</p>';
        return;
    }

    // فلترة المحادثات
    let filtered = conversations;
    const statusFilter = filterStatus ? filterStatus.value : 'all';
    if (statusFilter !== 'all') {
        filtered = filtered.filter(conv => conv.status === statusFilter);
    }

    // ترتيب المحادثات
    const sortValue = sortBy ? sortBy.value : 'recent';
    filtered = [...filtered].sort((a, b) => {
        if (sortValue === 'recent') {
            return new Date(b.updated_at) - new Date(a.updated_at);
        } else if (sortValue === 'oldest') {
            return new Date(a.updated_at) - new Date(b.updated_at);
        } else if (sortValue === 'unread') {
            const aUnread = a.unread_count || 0;
            const bUnread = b.unread_count || 0;
            if (aUnread !== bUnread) {
                return bUnread - aUnread;
            }
            return new Date(b.updated_at) - new Date(a.updated_at);
        }
        return 0;
    });

    if (filtered.length === 0) {
        conversationsList.innerHTML = '<p class="empty-state">لا توجد محادثات تطابق الفلتر</p>';
        return;
    }

    conversationsList.innerHTML = filtered.map(conv => {
        const isActive = conv.id === currentConversationId;
        const customerName = conv.customer_name || 'عميل';
        const customerPhone = conv.customer_phone || '';
        const unreadCount = conv.unread_count || 0;
        const lastUpdate = formatRelativeTime(new Date(conv.updated_at));
        const statusIcon = conv.status === 'active' ? '🟢' : '⏳';
        
        return `
            <div class="conversation-item ${isActive ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}" onclick="selectConversation('${conv.id}')">
                <div class="conversation-avatar">
                    <div class="avatar-circle">${customerName.charAt(0)}</div>
                    ${conv.status === 'active' ? '<span class="online-indicator"></span>' : ''}
                </div>
                <div class="conversation-content">
                    <div class="conversation-header">
                        <div class="conversation-name-section">
                            <h4>${escapeHtml(customerName)}</h4>
                            ${customerPhone ? `<span class="conversation-phone">${escapeHtml(customerPhone)}</span>` : ''}
                        </div>
                        ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                    </div>
                    <div class="conversation-meta">
                        <span class="conversation-status ${conv.status}">
                            ${statusIcon} ${getStatusText(conv.status)}
                        </span>
                        <span class="conversation-time">${lastUpdate}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// تنسيق الوقت النسبي
function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 7) return `منذ ${days} يوم`;
    return date.toLocaleDateString('ar-SA');
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusText(status) {
    const statusMap = {
        'waiting': 'في الانتظار',
        'active': 'نشط',
        'closed': 'مغلق'
    };
    return statusMap[status] || status;
}

function updateConversationBadge(conversationId) {
    const item = conversationsList.querySelector(`[onclick*="${conversationId}"]`);
    if (item) {
        // تحديث الشارة
        loadConversations();
    }
}

async function updateActiveChatsCount() {
    const activeCount = conversations.filter(c => c.status === 'active').length;
    if (activeChatsCount) {
        activeChatsCount.textContent = activeCount;
    }
    
    // تحديث عدد الرسائل اليوم
    if (messagesToday && currentRepId) {
        try {
            const response = await fetch(`/api/rep/stats/${currentRepId}`);
            const stats = await response.json();
            messagesToday.textContent = stats.messages_today || 0;
        } catch (error) {
            console.error('Error fetching rep stats:', error);
            messagesToday.textContent = '0';
        }
    }
}

function selectConversation(conversationId) {
    currentConversationId = conversationId;
    socket.emit('join_conversation', conversationId);
    
    const conversation = conversations.find(c => c.id === conversationId);
    if (conversation) {
        const customerName = conversation.customer_name || 'عميل';
        const customerPhone = conversation.customer_phone || '';
        chatTitle.textContent = customerName;
        
        // تحديث معلومات العميل
        if (customerDetails) {
            let detailsText = `المحادثة: ${getStatusText(conversation.status)}`;
            if (customerPhone) {
                detailsText += ` | ${customerPhone}`;
            }
            customerDetails.textContent = detailsText;
        }
        
        // تحديث حالة العميل
        if (customerStatusDot && customerStatusText) {
            if (conversation.status === 'active') {
                customerStatusDot.classList.add('active');
                customerStatusText.textContent = 'متصل';
            } else {
                customerStatusDot.classList.remove('active');
                customerStatusText.textContent = 'غير متصل';
            }
        }
        
        // إظهار زر تمييز كمقروء إذا كانت هناك رسائل غير مقروءة
        if (markReadBtn && (conversation.unread_count || 0) > 0) {
            markReadBtn.style.display = 'block';
        } else if (markReadBtn) {
            markReadBtn.style.display = 'none';
        }
    }
    
    chatPlaceholder.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    
    // على الشاشات الصغيرة: إخفاء القائمة وإخفاء لوحة التحكم وإظهار المحادثة على كامل الشاشة
    if (window.innerWidth <= 768) {
        conversationsSidebar.classList.add('hidden');
        chatPanel.classList.add('active');
        const dashboardHeader = document.querySelector('.dashboard-header');
        if (dashboardHeader) {
            dashboardHeader.classList.add('hidden');
            dashboardHeader.classList.add('chat-mode-hidden');
        }
        document.body.style.overflow = 'hidden';
    }
    
    renderConversationsList();
    
    // تأخير بسيط لضمان تحميل الرسائل قبل التركيز
    setTimeout(() => {
        messageInput.focus();
    }, 300);
}

function goBackToConversations() {
    // على الشاشات الصغيرة: إخفاء المحادثة وإظهار القائمة ولوحة التحكم
    if (window.innerWidth <= 768) {
        chatPanel.classList.remove('active');
        conversationsSidebar.classList.remove('hidden');
        const dashboardHeader = document.querySelector('.dashboard-header');
        if (dashboardHeader) {
            dashboardHeader.classList.remove('hidden');
            dashboardHeader.classList.remove('chat-mode-hidden');
        }
        document.body.style.overflow = '';
    } else {
        // على الشاشات الكبيرة: إظهار placeholder
        chatContainer.classList.add('hidden');
        chatPlaceholder.classList.remove('hidden');
    }
    currentConversationId = null;
}

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    } else if (currentConversationId) {
        socket.emit('typing', {
            conversationId: currentConversationId,
            isTyping: true
        });
        
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            socket.emit('typing', {
                conversationId: currentConversationId,
                isTyping: false
            });
        }, 1000);
    }
});

messageInput.addEventListener('blur', () => {
    if (currentConversationId) {
        socket.emit('typing', {
            conversationId: currentConversationId,
            isTyping: false
        });
    }
});

sendButton.addEventListener('click', sendMessage);

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && currentConversationId) {
        socket.emit('send_message', {
            conversationId: currentConversationId,
            message: message,
            senderId: currentRepId
        });
        messageInput.value = '';
    }
}

function addMessageToChat(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.sender_id === currentRepId ? 'sent' : 'received'}`;
    
    const senderName = message.sender_name || (message.sender_role === 'sales_rep' ? 'أنت' : 'العميل');
    const timestamp = new Date(message.created_at).toLocaleTimeString('ar-SA', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    let content = '';
    
    // دعم بطاقات المنتجات
    if (message.product || message.product_id) {
        const product = message.product || products.find(p => p.id === message.product_id);
        if (product) {
            content = `
                <div class="product-card-message">
                    ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" class="product-card-image" onerror="this.style.display='none'">` : ''}
                    <div class="product-card-content">
                        <h4 class="product-card-name">${escapeHtml(product.name)}</h4>
                        ${product.description ? `<p class="product-card-description">${escapeHtml(product.description)}</p>` : ''}
                        ${product.price ? `<div class="product-card-price">${product.price} ر.س</div>` : ''}
                        ${product.specifications ? `<div class="product-card-specs">
                            <strong>المواصفات:</strong>
                            <ul>${product.specifications.split('\n').filter(s => s.trim()).map(s => `<li>${escapeHtml(s.trim())}</li>`).join('')}</ul>
                        </div>` : ''}
                        ${product.video_url ? `<div class="product-card-video">
                            <a href="${product.video_url}" target="_blank" class="btn btn-primary btn-small">مشاهدة الفيديو</a>
                        </div>` : ''}
                    </div>
                </div>
            `;
        } else {
            content = escapeHtml(message.message || '[بطاقة منتج]');
        }
    } else {
        content = escapeHtml(message.message || '');
        
        // دعم روابط
        content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: inherit; text-decoration: underline;">$1</a>');
        
        // دعم الصور إذا كانت الرسالة رابط صورة
        if (message.image_url) {
            content = `<img src="${message.image_url}" alt="صورة" class="image-preview" onclick="window.open('${message.image_url}', '_blank')">`;
        }
    }
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="sender-name">${senderName}</span>
            <span class="message-time">${timestamp}</span>
        </div>
        <div class="message-content">${content}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
}

// البحث في المحادثات
searchConversations.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const items = conversationsList.querySelectorAll('.conversation-item');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? 'block' : 'none';
    });
});

// رفع الملفات
fileUploadBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const imageData = event.target.result;
            socket.emit('send_message', {
                conversationId: currentConversationId,
                message: '[صورة]',
                image_url: imageData,
                senderId: currentRepId
            });
            showNotification('تم إرسال الصورة', 'success');
        };
        reader.readAsDataURL(file);
    } else if (file) {
        showNotification('يرجى اختيار ملف صورة فقط', 'error');
    }
    fileInput.value = '';
});

// زر الإيموجي
emojiBtn.addEventListener('click', () => {
    const emojis = ['😊', '😂', '❤️', '👍', '👎', '🔥', '✨', '🎉', '👏', '🙏', '💯', '✅'];
    const selectedEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    if (currentConversationId) {
        messageInput.value += selectedEmoji + ' ';
        messageInput.focus();
    }
});

// ردود سريعة
function sendQuickMessage(message) {
    if (currentConversationId && messageInput) {
        messageInput.value = message;
        sendMessage();
    }
}

// تحميل المنتجات
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        products = await response.json();
        renderProductsList();
    } catch (error) {
        console.error('Error loading products:', error);
        if (productsSelectList) {
            productsSelectList.innerHTML = '<p class="empty-state">حدث خطأ في تحميل المنتجات</p>';
        }
    }
}

// عرض قائمة المنتجات
function renderProductsList(searchTerm = '') {
    if (!productsSelectList) return;
    
    let filteredProducts = products;
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredProducts = products.filter(p => 
            p.name.toLowerCase().includes(term) ||
            (p.description && p.description.toLowerCase().includes(term))
        );
    }
    
    if (filteredProducts.length === 0) {
        productsSelectList.innerHTML = '<p class="empty-state">لا توجد منتجات</p>';
        return;
    }
    
    productsSelectList.innerHTML = filteredProducts.map(product => `
        <div class="product-select-item" onclick="sendProduct('${product.id}')">
            ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" class="product-select-image" onerror="this.style.display='none'">` : ''}
            <div class="product-select-info">
                <h4>${escapeHtml(product.name)}</h4>
                ${product.description ? `<p>${escapeHtml(product.description.substring(0, 50))}${product.description.length > 50 ? '...' : ''}</p>` : ''}
                ${product.price ? `<span class="product-select-price">${product.price} ر.س</span>` : ''}
            </div>
        </div>
    `).join('');
}

// إرسال منتج
function sendProduct(productId) {
    if (!currentConversationId) {
        showNotification('يرجى اختيار محادثة أولاً', 'error');
        return;
    }
    
    const product = products.find(p => p.id === productId);
    if (!product) {
        showNotification('المنتج غير موجود', 'error');
        return;
    }
    
    socket.emit('send_message', {
        conversationId: currentConversationId,
        senderId: currentRepId,
        product_id: productId,
        message_type: 'product',
        message: `[بطاقة منتج: ${product.name}]`
    });
    
    closeProductSelectModalFunc();
    showNotification('تم إرسال بطاقة المنتج', 'success');
}

// فتح نافذة اختيار المنتج
function openProductSelectModal() {
    if (!currentConversationId) {
        showNotification('يرجى اختيار محادثة أولاً', 'error');
        return;
    }
    
    if (productSelectModal) {
        productSelectModal.classList.add('active');
        loadProducts();
    }
}

// إغلاق نافذة اختيار المنتج
function closeProductSelectModalFunc() {
    if (productSelectModal) {
        productSelectModal.classList.remove('active');
        if (searchProducts) searchProducts.value = '';
    }
}

// جعل الدوال متاحة عالمياً
window.sendProduct = sendProduct;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// تحديث المحادثات كل 5 ثوان
setInterval(() => {
    loadConversations();
}, 5000);

// تحديث تلقائي للصفحة عند فقدان الاتصال
socket.on('disconnect', () => {
    showNotification('انقطع الاتصال. جاري إعادة الاتصال...', 'error');
});

socket.on('connect', () => {
    // التحقق من وجود جلسة محفوظة
    const session = getStoredRepSession();
    if (session && session.repId) {
        currentRepId = session.repId;
        socket.emit('register', {
            id: session.repId,
            name: session.name || 'مندوب',
            role: 'sales_rep'
        });
        showNotification('تم إعادة الاتصال بنجاح', 'success');
    } else if (currentRepId) {
        // إذا كان currentRepId موجوداً ولكن لا توجد جلسة، نحاول استخدامه
        socket.emit('register', {
            id: currentRepId,
            name: chatTitle?.textContent || 'مندوب',
            role: 'sales_rep'
        });
    }
});

// تحسينات للشاشات الصغيرة
if (window.innerWidth <= 768) {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport && messageInput) {
        messageInput.addEventListener('focus', () => {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        });
        
        messageInput.addEventListener('blur', () => {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
        });
    }
}

// تحسين تجربة اللمس
document.querySelectorAll('button, .btn, .conversation-item').forEach(element => {
    element.addEventListener('touchstart', function() {
        this.style.opacity = '0.8';
    });
    element.addEventListener('touchend', function() {
        setTimeout(() => {
            this.style.opacity = '1';
        }, 150);
    });
});

// تحسين التمرير للشاشات الصغيرة
function scrollToBottom() {
    if (chatMessages) {
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 100);
        });
    }
}
