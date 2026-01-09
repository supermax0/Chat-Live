const socket = io({ transports: ['websocket', 'polling'] });

// إضافة مستمعات للأحداث العامة
socket.on('connect', () => {
    console.log('Socket connected');
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
    showNotification('انقطع الاتصال. جاري إعادة الاتصال...', 'error');
});

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    showNotification('حدث خطأ في الاتصال بالخادم', 'error');
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
    if (error && error.message) {
        showNotification('حدث خطأ: ' + error.message, 'error');
    }
});

let currentUserId = null;
let currentConversationId = null;
let typingTimer = null;

const loginScreen = document.getElementById('loginScreen');
const chatContainer = document.getElementById('chatContainer');
const loginForm = document.getElementById('loginForm');
const customerNameInput = document.getElementById('customerName');
const customerPhoneInput = document.getElementById('customerPhone');
const customerPhoneDisplay = document.getElementById('customerPhoneDisplay');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const statusText = document.getElementById('statusText');
const chatTitle = document.getElementById('chatTitle');
const typingIndicator = document.getElementById('typingIndicator');
const fileUploadBtn = document.getElementById('fileUploadBtn');
const fileInput = document.getElementById('fileInput');
const emojiBtn = document.getElementById('emojiBtn');
const notificationContainer = document.getElementById('notificationContainer');

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

// التحقق من صحة رقم الهاتف
function validatePhone(phone) {
    // إزالة المسافات والأرقام غير الصحيحة
    const cleaned = phone.replace(/\D/g, '');
    // يجب أن يكون 10 أرقام
    return cleaned.length === 10 && /^[0-9]{10}$/.test(cleaned);
}

// تنسيق رقم الهاتف
function formatPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return `0${cleaned}`;
    }
    return cleaned;
}

// معالجة إدخال رقم الهاتف
if (customerPhoneInput) {
    customerPhoneInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 10) {
            value = value.slice(0, 10);
        }
        e.target.value = value;
    });
    
    customerPhoneInput.addEventListener('keypress', (e) => {
        // السماح فقط بالأرقام
        if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'Enter'].includes(e.key)) {
            e.preventDefault();
        }
    });
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = customerNameInput.value.trim();
    const phone = customerPhoneInput.value.trim();
    
    if (!name) {
        showNotification('يرجى إدخال اسمك', 'error');
        customerNameInput.focus();
        return;
    }
    
    if (!phone) {
        showNotification('يرجى إدخال رقم الهاتف', 'error');
        customerPhoneInput.focus();
        return;
    }
    
    if (!validatePhone(phone)) {
        showNotification('يرجى إدخال رقم هاتف صحيح (10 أرقام)', 'error');
        customerPhoneInput.focus();
        return;
    }
    
    const formattedPhone = formatPhone(phone);
    currentUserId = 'customer_' + Date.now();
    
    console.log('Registering customer:', { id: currentUserId, name, phone: formattedPhone });
    
    // التحقق من الاتصال قبل الإرسال
    if (!socket.connected) {
        showNotification('جاري الاتصال بالخادم...', 'info');
        socket.connect();
    }
    
    socket.emit('register', {
        id: currentUserId,
        name: name,
        phone: formattedPhone,
        role: 'customer'
    });
    
    // حفظ معلومات العميل
    localStorage.setItem('customerInfo', JSON.stringify({
        name: name,
        phone: formattedPhone
    }));
    
    // إظهار رسالة تحميل
    showNotification('جاري الاتصال...', 'info');
});

socket.on('registered', (data) => {
    console.log('Registered event received:', data);
    if (data && data.userId) {
        currentUserId = data.userId;
        loginScreen.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        
        // عرض معلومات العميل
        const customerInfo = JSON.parse(localStorage.getItem('customerInfo') || '{}');
        chatTitle.textContent = customerInfo.name || data.name || 'المحادثة';
        if (customerPhoneDisplay && customerInfo.phone) {
            customerPhoneDisplay.textContent = customerInfo.phone;
            customerPhoneDisplay.style.display = 'block';
        }
    } else {
        console.error('Invalid registered data:', data);
        showNotification('حدث خطأ في تسجيل الدخول', 'error');
    }
});

socket.on('customer_session', (data) => {
    // حفظ جلسة العميل
    if (data.sessionId) {
        localStorage.setItem('customerSession', JSON.stringify({
            sessionId: data.sessionId,
            customerId: currentUserId,
            conversationId: data.conversationId
        }));
    }
});

socket.on('conversation_created', (data) => {
    if (data && data.conversationId) {
        currentConversationId = data.conversationId;
        socket.emit('join_conversation', currentConversationId);
    }
});

socket.on('conversation_joined', (data) => {
    if (data && data.conversationId) {
        currentConversationId = data.conversationId;
        socket.emit('join_conversation', currentConversationId);
    }
});

socket.on('sales_rep_assigned', (data) => {
    statusText.textContent = `متصل مع: ${data.salesRepName}`;
    statusText.parentElement.querySelector('.status-dot').classList.add('active');
    messageInput.disabled = false;
    sendButton.disabled = false;
    if (fileUploadBtn) fileUploadBtn.disabled = false;
    if (emojiBtn) emojiBtn.disabled = false;
    messageInput.focus();
    playNotificationSound();
    showNotification('تم ربطك بمندوب المبيعات: ' + data.salesRepName, 'success');
});

socket.on('messages_history', (messages) => {
    chatMessages.innerHTML = '';
    messages.forEach(message => {
        addMessageToChat(message);
    });
    scrollToBottom();
});

socket.on('new_message', (message) => {
    addMessageToChat(message);
    scrollToBottom();
    
    // إشعار صوتي للرسائل الواردة
    if (message.sender_id !== currentUserId) {
        playNotificationSound();
        if (!document.hasFocus()) {
            showNotification('رسالة جديدة من ' + (message.sender_name || 'مندوب المبيعات'));
        }
        socket.emit('mark_read', { conversationId: currentConversationId });
    }
});

socket.on('user_typing', (data) => {
    if (data.isTyping && data.userId !== currentUserId) {
        typingIndicator.classList.remove('hidden');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            typingIndicator.classList.add('hidden');
        }, 3000);
    } else {
        typingIndicator.classList.add('hidden');
    }
});

function addMessageToChat(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.sender_id === currentUserId ? 'sent' : 'received'}`;
    
    const senderName = message.sender_name || (message.sender_role === 'customer' ? 'أنت' : 'مندوب المبيعات');
    const timestamp = new Date(message.created_at).toLocaleTimeString('ar-SA', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    let content = '';
    
    // دعم بطاقات المنتجات
    if (message.product || message.product_id) {
        const product = message.product;
        if (product) {
            const productId = product.id || message.product_id;
            content = `
                <div class="product-card-message" onclick="showProductDetails('${productId}', ${JSON.stringify(product).replace(/"/g, '&quot;')})" style="cursor: pointer;">
                    ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" class="product-card-image" onerror="this.style.display='none'">` : ''}
                    <div class="product-card-content">
                        <h4 class="product-card-name">${escapeHtml(product.name)}</h4>
                        ${product.description ? `<p class="product-card-description">${escapeHtml(product.description.substring(0, 80))}${product.description.length > 80 ? '...' : ''}</p>` : ''}
                        ${product.price ? `<div class="product-card-price">${product.price} ر.س</div>` : ''}
                        <div class="product-card-click-hint">اضغط لعرض التفاصيل</div>
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

// عرض تفاصيل المنتج
function showProductDetails(productId, product) {
    const modal = document.getElementById('productDetailsModal');
    const content = document.getElementById('productDetailsContent');
    const title = document.getElementById('productDetailsTitle');
    
    if (!modal || !content) return;
    
    if (title) title.textContent = product.name || 'تفاصيل المنتج';
    
    content.innerHTML = `
        ${product.image_url ? `
            <div class="product-details-image-container">
                <img src="${product.image_url}" alt="${product.name}" class="product-details-image" onerror="this.style.display='none'">
            </div>
        ` : ''}
        ${product.video_url ? `
            <div class="product-details-video-container">
                <video controls class="product-details-video">
                    <source src="${product.video_url}" type="video/mp4">
                    متصفحك لا يدعم تشغيل الفيديو.
                </video>
            </div>
        ` : ''}
        <div class="product-details-info">
            <h3 class="product-details-name">${escapeHtml(product.name)}</h3>
            ${product.price ? `<div class="product-details-price">${product.price} ر.س</div>` : ''}
            ${product.description ? `<div class="product-details-description">${escapeHtml(product.description)}</div>` : ''}
            ${product.specifications ? `
                <div class="product-details-specifications">
                    <h4>المواصفات:</h4>
                    <ul>
                        ${product.specifications.split('\n').filter(s => s.trim()).map(s => `<li>${escapeHtml(s.trim())}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;
    
    modal.classList.add('active');
}

// إغلاق نافذة تفاصيل المنتج
function closeProductDetailsModal() {
    const modal = document.getElementById('productDetailsModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// جعل الدوال متاحة عالمياً
window.showProductDetails = showProductDetails;
window.closeProductDetailsModal = closeProductDetailsModal;

// إعداد مستمعي الأحداث
const closeProductDetailsModalBtn = document.getElementById('closeProductDetailsModal');
if (closeProductDetailsModalBtn) {
    closeProductDetailsModalBtn.addEventListener('click', closeProductDetailsModal);
}

const productDetailsModal = document.getElementById('productDetailsModal');
if (productDetailsModal) {
    productDetailsModal.addEventListener('click', (e) => {
        if (e.target === productDetailsModal) {
            closeProductDetailsModal();
        }
    });
}

// رفع الملفات
fileUploadBtn.addEventListener('click', () => {
    if (!messageInput.disabled) {
        fileInput.click();
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const imageData = event.target.result;
            // إرسال الصورة كرسالة
            socket.emit('send_message', {
                conversationId: currentConversationId,
                message: '[صورة]',
                image_url: imageData,
                senderId: currentUserId
            });
            showNotification('تم إرسال الصورة', 'success');
        };
        reader.readAsDataURL(file);
    } else if (file) {
        showNotification('يرجى اختيار ملف صورة فقط', 'error');
    }
    fileInput.value = '';
});

// زر الإيموجي (قائمة إيموجي بسيطة)
emojiBtn.addEventListener('click', () => {
    const emojis = ['😊', '😂', '❤️', '👍', '👎', '🔥', '✨', '🎉', '👏', '🙏'];
    const selectedEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    if (!messageInput.disabled && currentConversationId) {
        messageInput.value += selectedEmoji + ' ';
        messageInput.focus();
    }
});

// تم نقل الدالة إلى الأعلى مع تحسينات

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

// تحسينات للهواتف المحمولة
messageInput.addEventListener('focus', () => {
    // تأخير بسيط لضمان عمل التمرير بشكل صحيح على iOS
    setTimeout(() => {
        if (currentConversationId) {
            scrollToBottom();
        }
    }, 300);
});

// منع التمرير عند فتح لوحة المفاتيح
let lastScrollTop = 0;
chatMessages.addEventListener('scroll', () => {
    lastScrollTop = chatMessages.scrollTop;
});

// تحسين إرسال الرسالة عند الضغط على زر الإرسال على الشاشات الصغيرة
sendButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    sendMessage();
}, { passive: false });

// إضافة تحسين للتمرير على الأجهزة المحمولة
function scrollToBottom() {
    requestAnimationFrame(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
        // محاولة إضافية للشاشات الصغيرة
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
    });
}

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
            senderId: currentUserId
        });
        messageInput.value = '';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// تحديث تلقائي للحالة
setInterval(() => {
    if (currentConversationId) {
        socket.emit('join_conversation', currentConversationId);
    }
}, 30000);

// تحسينات للشاشات الصغيرة - منع التكبير عند التركيز على الإدخال
if (window.innerWidth <= 768) {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
        messageInput.addEventListener('focus', () => {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        });
        
        messageInput.addEventListener('blur', () => {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
        });
    }
}

// تحميل معلومات العميل المحفوظة
function loadStoredCustomerInfo() {
    try {
        const stored = localStorage.getItem('customerInfo');
        if (stored) {
            const info = JSON.parse(stored);
            if (customerNameInput && info.name) {
                customerNameInput.value = info.name;
            }
            if (customerPhoneInput && info.phone) {
                // إزالة الصفر الأول إذا كان موجوداً
                customerPhoneInput.value = info.phone.replace(/^0/, '');
            }
        }
    } catch (error) {
        console.error('Error loading stored customer info:', error);
    }
}

// التحقق من جلسة العميل المحفوظة
async function checkStoredCustomerSession() {
    try {
        const sessionData = localStorage.getItem('customerSession');
        if (!sessionData) return false;
        
        const session = JSON.parse(sessionData);
        if (!session.sessionId) return false;
        
        const response = await fetch(`/api/customer/session/${session.sessionId}/validate`);
        const data = await response.json();
        
        if (data.valid && data.session) {
            currentUserId = data.session.customerId;
            currentConversationId = data.session.conversationId;
            
            // تحميل معلومات العميل
            const customerInfo = JSON.parse(localStorage.getItem('customerInfo') || '{}');
            
            loginScreen.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            
            chatTitle.textContent = data.session.customerName || customerInfo.name || 'المحادثة';
            if (customerPhoneDisplay) {
                customerPhoneDisplay.textContent = data.session.customerPhone || customerInfo.phone || '';
                customerPhoneDisplay.style.display = 'block';
            }
            
            // الاتصال بالـ socket
            socket.emit('register', {
                id: currentUserId,
                name: data.session.customerName,
                phone: data.session.customerPhone,
                role: 'customer'
            });
            
            if (currentConversationId) {
                socket.emit('join_conversation', currentConversationId);
            }
            
            return true;
        } else {
            localStorage.removeItem('customerSession');
            return false;
        }
    } catch (error) {
        console.error('Error checking customer session:', error);
        return false;
    }
}

// تهيئة الصفحة عند التحميل
window.addEventListener('DOMContentLoaded', () => {
    loadStoredCustomerInfo();
    // التحقق من الجلسة المحفوظة
    setTimeout(() => {
        checkStoredCustomerSession();
    }, 100);
});

// تحسين تجربة اللمس - منع التمرير عند السحب على الأزرار
document.querySelectorAll('button, .btn').forEach(button => {
    button.addEventListener('touchstart', function(e) {
        this.style.opacity = '0.8';
    }, { passive: true });
    button.addEventListener('touchend', function(e) {
        this.style.opacity = '1';
    }, { passive: true });
});
