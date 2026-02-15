/* ==================================================
   CAUVERY WEDDING HALL - COMPLETE WORKING VERSION
   All Functions Implemented
   ================================================== */
const CLIENT_ID = '194658348326-6it21orc6nnhaj17s0a2536t5c8lt9v6.apps.googleusercontent.com'; 
const API_KEY = 'AIzaSyCfQU6b59gao-oypLobWMXhb4SSD5XpHVQ';

const DISCOVERY_DOCS = [
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
];
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file';

/* STATE MANAGEMENT */
let tokenClient;
let gapiInited = false;
let gisInited = false;
let userEmail = '';
let bookingData = {};
let allBookings = [];
let filteredBookings = [];
let currentPage = 1;
let rowsPerPage = 10;

let reportData = [];
let filteredReportData = [];
let reportCurrentPage = 1;
let reportRowsPerPage = 5;

let barChartInstance = null;
let pieChartInstance = null;
let doughnutChartInstance = null;
let lineChartInstance = null;

let otherServiceCount = 0;
let otherExpenseCount = 0;
let notifications = [];
let dismissedNotifications = [];
let finalPdfLink = "";

/* LOCAL STORAGE */
function saveToLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error('Error saving to localStorage:', e);
    }
}

function getFromLocalStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.error('Error reading from localStorage:', e);
        return defaultValue;
    }
}

function loadUserSession() {
    const savedEmail = getFromLocalStorage('userEmail');
    const savedUserInfo = getFromLocalStorage('userInfo');
    
    if (savedEmail && savedUserInfo) {
        userEmail = savedEmail;
        userInfo = savedUserInfo;
        updateSignInButton(savedEmail, savedUserInfo);
        // Note: We do NOT fetch data here anymore. We wait for gapiLoaded.
    }
    dismissedNotifications = getFromLocalStorage('dismissedNotifications', []);
}

function updateSignInButton(email, info) {
    const btn = document.getElementById('googleSignInBtn');
    
    // Styling for "Logged In" state
    btn.classList.remove('disabled');
    btn.classList.add('success');
    btn.removeAttribute('disabled'); // Ensure it's clickable
    
    // Set content
    btn.innerHTML = `
        <i class="fas fa-user-circle" style="font-size: 1.1em;"></i>
        <span id="btnText" style="margin: 0 8px;">${email}</span>
        <i class="fas fa-chevron-down" style="font-size: 0.8em;"></i>
    `;
    
    // FIX: Explicitly remove old listener and add new one
    btn.onclick = null; 
    btn.onclick = function(e) {
        toggleUserDropdown(e);
    };
    
    // Create Dropdown HTML if it doesn't exist
    if (!document.getElementById('userDropdown')) {
        const dropdown = document.createElement('div');
        dropdown.id = 'userDropdown';
        dropdown.className = 'user-dropdown';
        dropdown.innerHTML = `
            <div class="user-dropdown-header">
                ${info && info.picture ? 
                    `<img src="${info.picture}" alt="Profile" class="user-avatar">` : 
                    '<i class="fas fa-user-circle user-avatar-icon"></i>'}
                <div class="user-dropdown-info">
                    <div class="user-dropdown-name">${email}</div>
                    <div class="user-dropdown-email">Google Account</div>
                </div>
            </div>
            <div class="user-dropdown-divider"></div>
            <button class="user-dropdown-item" onclick="handleLogout()">
                <i class="fas fa-sign-out-alt"></i>
                <span>Logout</span>
            </button>
        `;
        // Append to the parent of the button so it sits next to it
        btn.parentElement.appendChild(dropdown);
    }
}

function toggleUserDropdown(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    const dropdown = document.getElementById('userDropdown');
    const btn = document.getElementById('googleSignInBtn');
    
    if (dropdown) {
        // Toggle the class
        const isShown = dropdown.classList.contains('show');
        
        // Close all other dropdowns first (like notifications)
        document.querySelectorAll('.notification-dropdown, .user-dropdown').forEach(el => {
            el.classList.remove('show');
        });

        // If it wasn't shown before, show it now
        if (!isShown) {
            dropdown.classList.add('show');
        }
    }
}
// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
    const userDropdown = document.getElementById('userDropdown');
    const signInBtn = document.getElementById('googleSignInBtn');
    
    if (userDropdown && userDropdown.classList.contains('show')) {
        if (!userDropdown.contains(e.target) && !signInBtn.contains(e.target)) {
            userDropdown.classList.remove('show');
        }
    }
});
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            // Only try to revoke if GAPI is ready and has a token
            if (gapiInited && gapi.client.getToken()) {
                const token = gapi.client.getToken();
                google.accounts.oauth2.revoke(token.access_token, () => {
                    console.log('Token revoked');
                });
                gapi.client.setToken('');
            }
        } catch (e) {
            console.warn("GAPI logout error (ignoring):", e);
        }
        
        // Always clear local data and reload
        clearLocalStorage();
        userEmail = '';
        userInfo = null;
        location.reload();
    }
}

function clearLocalStorage() {
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('dismissedNotifications');
}

document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('userDropdown');
    const btn = document.getElementById('googleSignInBtn');
    if (dropdown && dropdown.classList.contains('show')) {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    }
});

/* INITIALIZATION */
document.addEventListener('DOMContentLoaded', () => {
    setDefaultDate();
    setupListeners();
    checkGoogleLibraryStatus();
    loadUserSession();
    
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    document.getElementById('rowsPerPage').addEventListener('change', handleRowsChange);
});

function setDefaultDate() {
    const now = new Date();
    const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    document.getElementById('bookingDate').value = localIso;
    calculateTotal();
}

function setupListeners() {
    const calcIds = [
        'totalHallAmount', 'advanceAmount', 
        'cleaningFee', 'cleaningFeeAmount', 
        'acRooms', 'acRoomsAmount', 
        'serialLights', 'serialLightsAmount',
        'speaker', 'speakerAmount', 
        'sapaduIlai', 'sapaduIlaiAmount',
        'waterCan', 'waterCanAmount'
    ];
    
    calcIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', calculateTotal);
    });

    document.getElementById('others').addEventListener('change', function() {
        const othersFields = document.getElementById('othersFields');
        othersFields.style.display = this.checked ? 'block' : 'none';
        if(!this.checked) {
            document.getElementById('othersContainer').innerHTML = '';
            otherServiceCount = 0;
        } else if (otherServiceCount === 0) {
            addOtherService();
        }
        calculateTotal();
    });
    document.getElementById('totalAddonsAmount').addEventListener('input', () => {
        // Just update final display, don't overwrite checkboxes logic
        const hall = parseFloat(document.getElementById('totalHallAmount').value) || 0;
        const addons = parseFloat(document.getElementById('totalAddonsAmount').value) || 0;
        document.getElementById('displayFinal').innerText = `₹ ${(hall + addons).toLocaleString('en-IN')}`;
    });
    document.getElementById('pendingAddonsAmount').addEventListener('input', function() {
        // 1. Get the current values
        const manualPending = parseFloat(this.value) || 0;
        const hallPending = parseFloat(document.getElementById('pendingAmount').value) || 0;
        
        // 2. Update the global bookingData object immediately
        // This ensures the correct value is used when you click "Confirm" or "Preview"
        if (typeof bookingData !== 'undefined') {
            bookingData.pendingAddons = manualPending;
            bookingData.totalPending = hallPending + manualPending;
            
            // Update the "Settled" status in the data object
            bookingData.addonsSettled = (manualPending === 0);
        }

        // 3. UX Feature: Auto-toggle the "Settled" checkbox
        const settledChk = document.getElementById('addonsSettled');
        if (manualPending === 0) {
            settledChk.checked = true;
        } else {
            settledChk.checked = false;
        }
    });

    document.getElementById('mobileNumber').addEventListener('input', validateMobile);
    document.getElementById('marriagePersonName').addEventListener('input', validateName);
    document.getElementById('customerFrom').addEventListener('input', validateCity);
    document.getElementById('amountGivenBy').addEventListener('input', validateGivenBy);
    document.getElementById('totalHallAmount').addEventListener('input', validateTotalAmount);
    document.getElementById('advanceAmount').addEventListener('input', validateAdvanceAmount);
    document.getElementById('fromDateTime').addEventListener('change', validateDates);
    document.getElementById('toDateTime').addEventListener('change', validateDates);
    document.getElementById('marriageDate').addEventListener('change', validateMarriageDate);
    document.getElementById('bookingDate').addEventListener('change', validateMarriageDate);

    document.getElementById('bookingForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('previewPdfBtn').addEventListener('click', handlePreviewPDF);
    document.getElementById('googleSignInBtn').addEventListener('click', handleAuthClick);
    document.getElementById('hallSettled').addEventListener('change', calculateTotal);
    document.getElementById('addonsSettled').addEventListener('change', calculateTotal);
    
    setupExpenseListeners();
}

function setupExpenseListeners() {
    const expenseIds = ['exp_staffSalary', 'exp_ilaiCleaning', 'exp_currentBill', 
                        'exp_purchase', 'exp_damage', 'exp_development'];
    
    expenseIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', calculateTotalExpenses);
    });
}

/* DYNAMIC OTHER SERVICES */
function addOtherService(title = '', amount = 0) {
    const container = document.getElementById('othersContainer');
    const id = ++otherServiceCount;
    
    const div = document.createElement('div');
    div.className = 'other-service-row';
    div.id = `other_service_${id}`;
    
    div.innerHTML = `
        <input type="text" id="other_title_${id}" placeholder="Service Name" value="${title}" class="fee-input">
        <input type="number" id="other_amount_${id}" value="${amount}" min="0" step="100" placeholder="Amount" class="fee-input" oninput="calculateTotal()">
        <button type="button" onclick="removeOtherService(${id})" class="remove-other-btn">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(div);
    calculateTotal();
}

function removeOtherService(id) {
    const element = document.getElementById(`other_service_${id}`);
    if (element) {
        element.remove();
    }
    calculateTotal();
}

/* VALIDATION FUNCTIONS */
/* VALIDATION FUNCTIONS (Updated for Safety) */
function showError(inputId, errorId, message) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    
    if (input) {
        input.classList.add('invalid');
        input.classList.remove('valid');
    }
    
    if (error) {
        error.textContent = message;
        error.classList.add('show');
    }
}

function hideError(inputId, errorId) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    
    if (input) {
        input.classList.remove('invalid');
        input.classList.add('valid');
    }
    
    if (error) {
        error.classList.remove('show');
    }
}

function validateMobile() {
    const mobile = document.getElementById('mobileNumber');
    const value = mobile.value.replace(/[^0-9]/g, '').slice(0, 10);
    mobile.value = value;

    if (value.length === 0) {
        hideError('mobileNumber', 'mobileError');
        return true;
    }

    if (value.length !== 10) {
        showError('mobileNumber', 'mobileError', 'Mobile number must be exactly 10 digits');
        return false;
    }

    if (!value.match(/^[6-9][0-9]{9}$/)) {
        showError('mobileNumber', 'mobileError', 'Please enter a valid Indian mobile number');
        return false;
    }

    hideError('mobileNumber', 'mobileError');
    return true;
}

function validateName() {
    const name = document.getElementById('marriagePersonName').value.trim();
    
    if (name.length === 0) {
        hideError('marriagePersonName', 'marriagePersonNameError');
        return true;
    }

    if (name.length < 3) {
        showError('marriagePersonName', 'marriagePersonNameError', 'Name must be at least 3 characters');
        return false;
    }

    hideError('marriagePersonName', 'marriagePersonNameError');
    return true;
}

function validateCity() {
    const city = document.getElementById('customerFrom').value.trim();
    
    if (city.length === 0) {
        hideError('customerFrom', 'customerFromError');
        return true;
    }

    if (city.length < 2) {
        showError('customerFrom', 'customerFromError', 'City name must be at least 2 characters');
        return false;
    }

    hideError('customerFrom', 'customerFromError');
    return true;
}

function validateGivenBy() {
    const givenBy = document.getElementById('amountGivenBy').value.trim();
    
    if (givenBy.length === 0) {
        hideError('amountGivenBy', 'amountGivenByError');
        return true;
    }

    if (givenBy.length < 3) {
        showError('amountGivenBy', 'amountGivenByError', 'Name must be at least 3 characters');
        return false;
    }

    hideError('amountGivenBy', 'amountGivenByError');
    return true;
}

function validateTotalAmount() {
    const total = parseFloat(document.getElementById('totalHallAmount').value) || 0;
    
    if (total < 1000) {
        showError('totalHallAmount', 'totalHallAmountError', 'Total amount must be at least ₹1,000');
        return false;
    }

    hideError('totalHallAmount', 'totalHallAmountError');
    validateAdvanceAmount();
    return true;
}

function validateAdvanceAmount() {
    const total = parseFloat(document.getElementById('totalHallAmount').value) || 0;
    const advance = parseFloat(document.getElementById('advanceAmount').value) || 0;
    
    if (advance < 0) {
        showError('advanceAmount', 'advanceAmountError', 'Advance amount cannot be negative');
        return false;
    }

    if (advance > total) {
        showError('advanceAmount', 'advanceAmountError', 'Advance cannot exceed total hall amount');
        return false;
    }

    hideError('advanceAmount', 'advanceAmountError');
    return true;
}

function validateMarriageDate() {
    const marriageDate = document.getElementById('marriageDate').value;
    
    if (!marriageDate) {
        hideError('marriageDate', 'marriageDateError');
        return true;
    }

    const selectedDate = new Date(marriageDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // if (selectedDate < today) {
    //     showError('marriageDate', 'marriageDateError', 'Marriage date cannot be in the past');
    //     return false;
    // }

    hideError('marriageDate', 'marriageDateError');
    return true;
}

function validateDates() {
    const fromDateTime = document.getElementById('fromDateTime').value;
    const toDateTime = document.getElementById('toDateTime').value;

    if (!fromDateTime || !toDateTime) {
        hideError('fromDateTime', 'fromDateTimeError');
        hideError('toDateTime', 'toDateTimeError');
        return true;
    }

    const from = new Date(fromDateTime);
    const to = new Date(toDateTime);

    if (to < from) {
        showError('toDateTime', 'toDateTimeError', 'End time must be after start time');
        return false;
    }

    const diffDays = (to - from) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
        showError('toDateTime', 'toDateTimeError', 'Booking duration cannot exceed 7 days');
        return false;
    }

    hideError('fromDateTime', 'fromDateTimeError');
    hideError('toDateTime', 'toDateTimeError');
    return true;
}

function validateAllFields() {
    const validations = [
        validateMobile(),
        validateName(),
        validateCity(),
        validateGivenBy(),
        validateTotalAmount(),
        validateAdvanceAmount(),
        validateMarriageDate(),
        validateDates()
    ];

    const requiredFields = [
        { id: 'marriageDate', error: 'marriageDateError', message: 'Marriage date is required' },
        { id: 'fromDateTime', error: 'fromDateTimeError', message: 'Start date & time is required' },
        { id: 'toDateTime', error: 'toDateTimeError', message: 'End date & time is required' },
        { id: 'marriagePersonName', error: 'marriagePersonNameError', message: 'Person name is required' },
        { id: 'mobileNumber', error: 'mobileError', message: 'Mobile number is required' },
        { id: 'customerFrom', error: 'customerFromError', message: 'City is required' },
        { id: 'amountGivenBy', error: 'amountGivenByError', message: 'This field is required' }
    ];

    requiredFields.forEach(field => {
        const value = document.getElementById(field.id).value.trim();
        if (!value) {
            showError(field.id, field.error, field.message);
            validations.push(false);
        }
    });

    return validations.every(v => v === true);
}

/* CALCULATION LOGIC */
function calculateTotal() {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? (parseFloat(el.value) || 0) : 0;
    };
    const isChecked = (id) => {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    };
    
    // --- 1. Hall Rent Calculation ---
    const totalHall = getVal('totalHallAmount');
    const advance = getVal('advanceAmount');
    const hallSettled = isChecked('hallSettled');
    
    const pendingHall = hallSettled ? 0 : Math.max(0, totalHall - advance);
    if(document.getElementById('pendingAmount')) {
        document.getElementById('pendingAmount').value = pendingHall;
    }

    // --- 2. Addons Calculation ---
    let calculatedAddons = 0;
    if(isChecked('cleaningFee')) calculatedAddons += getVal('cleaningFeeAmount');
    if(isChecked('acRooms')) calculatedAddons += getVal('acRoomsAmount');
    if(isChecked('serialLights')) calculatedAddons += getVal('serialLightsAmount');
    if(isChecked('speaker')) calculatedAddons += getVal('speakerAmount');
    if(isChecked('sapaduIlai')) calculatedAddons += getVal('sapaduIlaiAmount');
    if(isChecked('waterCan')) calculatedAddons += getVal('waterCanAmount');
    
    // Check Others - SAFELY
    const othersList = [];
    if(isChecked('others')) {
        for (let i = 1; i <= otherServiceCount; i++) {
            const amountEl = document.getElementById(`other_amount_${i}`);
            const titleEl = document.getElementById(`other_title_${i}`);
            
            // Only add if element actually exists
            if (amountEl && titleEl) {
                const amt = parseFloat(amountEl.value) || 0;
                calculatedAddons += amt;
                othersList.push({ title: titleEl.value, amount: amt });
            }
        }
    }

    const currentTotalAddonsInput = document.getElementById('totalAddonsAmount');
    currentTotalAddonsInput.value = calculatedAddons;

    const addonsSettled = isChecked('addonsSettled');
    const pendingAddonsInput = document.getElementById('pendingAddonsAmount');
    
    if (addonsSettled) {
        pendingAddonsInput.value = 0;
        pendingAddonsInput.disabled = true; 
    } else {
        pendingAddonsInput.disabled = false;
        pendingAddonsInput.value = calculatedAddons;
    }
    
    const pendingAddons = parseFloat(pendingAddonsInput.value) || 0;
    const totalAddons = parseFloat(currentTotalAddonsInput.value) || 0;

    // --- 3. Final Display ---
    const finalTotalBill = totalHall + totalAddons;
    const finalTotalPending = pendingHall + pendingAddons;

    document.getElementById('displayFinal').innerText = `₹ ${finalTotalBill.toLocaleString('en-IN')}`;
    
    // Store in global object
    bookingData = {
        totalHall,
        advance,
        pendingHall,
        totalAddons,
        pendingAddons,
        finalTotal: finalTotalBill,
        totalPending: finalTotalPending,
        hallSettled,
        addonsSettled,
        fees: {
            cleaning: isChecked('cleaningFee') ? getVal('cleaningFeeAmount') : 0,
            ac: isChecked('acRooms') ? getVal('acRoomsAmount') : 0,
            lights: isChecked('serialLights') ? getVal('serialLightsAmount') : 0,
            speaker: isChecked('speaker') ? getVal('speakerAmount') : 0,
            ilai: isChecked('sapaduIlai') ? getVal('sapaduIlaiAmount') : 0,
            waterCan: isChecked('waterCan') ? getVal('waterCanAmount') : 0,
            others: othersList
        }
    };
}

/* NOTIFICATION SYSTEM */
function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    dropdown.classList.toggle('show');
    
    if (dropdown.classList.contains('show')) {
        loadNotifications();
    }
}

async function loadNotifications() {
    if (!gapiInited || !gapi.client.getToken()) {
        document.getElementById('notificationList').innerHTML = `
            <div class="notification-empty">
                <i class="fas fa-bell-slash"></i>
                <p>Please sign in to view notifications</p>
            </div>
        `;
        return;
    }
    
    try {
        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));
        const twoDaysAhead = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000));
        
        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': twoDaysAgo.toISOString(),
            'timeMax': twoDaysAhead.toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'orderBy': 'startTime'
        });
        
        const events = response.result.items;
        notifications = [];
        
        events.forEach(event => {
            if (!event.summary || !event.summary.includes('Marriage')) return;
            
            const eventDate = new Date(event.start.dateTime || event.start.date);
            const diffDays = Math.floor((eventDate - now) / (1000 * 60 * 60 * 24));
            
            const desc = event.description || '';
            const nameMatch = event.summary.match(/Marriage - (.+)/);
            const mobileMatch = desc.match(/Mobile Number: (\d+)/);
            
            const name = nameMatch ? nameMatch[1] : 'Customer';
            const mobile = mobileMatch ? mobileMatch[1] : null;
            const notificationId = `${event.id}_${diffDays}`;
            
            if (dismissedNotifications.includes(notificationId)) return;
            
            if (diffDays >= 0 && diffDays <= 2) {
                const daysText = diffDays === 0 ? 'இன்று' : diffDays === 1 ? 'நாளை' : 'நாளை மறுநாள்';
                notifications.push({
                    id: notificationId,
                    type: 'reminder',
                    eventId: event.id,
                    name: name,
                    mobile: mobile,
                    date: eventDate,
                    daysText: daysText,
                    diffDays: diffDays
                });
            }
            
            if (diffDays >= -2 && diffDays < 0) {
                const daysText = diffDays === -1 ? 'நேற்று' : 'நேற்று முந்தைய நாள்';
                notifications.push({
                    id: notificationId,
                    type: 'thank',
                    eventId: event.id,
                    name: name,
                    mobile: mobile,
                    date: eventDate,
                    daysText: daysText,
                    diffDays: diffDays
                });
            }
        });
        
        renderNotifications();
        
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function renderNotifications() {
    const container = document.getElementById('notificationList');
    const badge = document.getElementById('notificationBadge');
    
    badge.innerText = notifications.length;
    
    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="notification-empty">
                <i class="fas fa-check-circle"></i>
                <p>No pending notifications</p>
            </div>
        `;
        return;
    }
    
    notifications.sort((a, b) => a.date - b.date);
    
    container.innerHTML = '';
    
    notifications.forEach(n => {
        const div = document.createElement('div');
        div.className = `notification-item ${n.type}`;
        
        // Common Date Format
        const dateStr = n.date.toLocaleDateString('ta-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        
        if (n.type === 'reminder') {
            div.innerHTML = `
                <div class="notification-title">🔔 திருமண நினைவூட்டல்</div>
                <div class="notification-message">
                    <strong>${n.name}</strong> அவர்களின் திருமணம் <strong>${n.daysText}</strong> நடைபெற உள்ளது
                </div>
                <div class="notification-date">📅 ${dateStr}</div>
                <div class="notification-actions">
                    <button class="notification-btn-action whatsapp" 
                        onclick="sendReminderWhatsApp('${n.eventId}', '${n.name}', '${n.mobile}', '${n.date.toISOString()}', '${n.daysText}', '${n.flag}')">
                        <i class="fab fa-whatsapp"></i> Send Reminder
                    </button>
                    <button class="notification-btn-action dismiss" 
                        onclick="handleNotificationDismiss('${n.eventId}', '${n.flag}')">
                        <i class="fas fa-check"></i> Mark Done
                    </button>
                </div>
            `;
        } else {
            div.innerHTML = `
                <div class="notification-title">🙏 நன்றி செய்தி</div>
                <div class="notification-message">
                    <strong>${n.name}</strong> அவர்களின் திருமணம் <strong>${n.daysText}</strong> நடைபெற்றது
                </div>
                <div class="notification-date">📅 ${dateStr}</div>
                <div class="notification-actions">
                    <button class="notification-btn-action whatsapp" 
                        onclick="sendThankYouWhatsApp('${n.eventId}', '${n.name}', '${n.mobile}', '${n.flag}')">
                        <i class="fab fa-whatsapp"></i> Send Thank You
                    </button>
                    <button class="notification-btn-action dismiss" 
                        onclick="handleNotificationDismiss('${n.eventId}', '${n.flag}')">
                        <i class="fas fa-check"></i> Mark Done
                    </button>
                </div>
            `;
        }
        container.appendChild(div);
    });
}

/* --- NEW FUNCTION: Mark Notification as Done in Calendar --- */
async function markNotificationAsDone(eventId, flag) {
    // Show a small loading indicator or just process in background
    console.log(`Marking event ${eventId} as ${flag}...`);
    
    try {
        // 1. Get current event to ensure we don't overwrite other data
        const response = await gapi.client.calendar.events.get({
            'calendarId': 'primary',
            'eventId': eventId
        });
        const event = response.result;
        
        let desc = event.description || "";
        
        // 2. Prevent duplicate flags
        if (!desc.includes(flag)) {
            event.description = desc + "\n" + flag;
            
            // 3. Update Calendar
            await gapi.client.calendar.events.update({
                'calendarId': 'primary',
                'eventId': eventId,
                'resource': event
            });
            console.log("Calendar updated successfully.");
        }
        
        // 4. Refresh list to remove the notification immediately
        loadNotifications();
        
    } catch (error) {
        console.error("Error updating notification status:", error);
        showAlert('Error', 'Could not update reminder status in Calendar.');
    }
}

async function loadNotifications() {
    if (!gapiInited || !gapi.client.getToken()) {
        document.getElementById('notificationList').innerHTML = `
            <div class="notification-empty">
                <i class="fas fa-bell-slash"></i>
                <p>Please sign in to view notifications</p>
            </div>
        `;
        return;
    }
    
    try {
        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));
        const twoDaysAhead = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000)); // Increased range slightly
        
        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': twoDaysAgo.toISOString(),
            'timeMax': twoDaysAhead.toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'orderBy': 'startTime'
        });
        
        const events = response.result.items;
        notifications = [];
        
        events.forEach(event => {
            if (!event.summary || !event.summary.includes('Marriage')) return;
            
            const eventDate = new Date(event.start.dateTime || event.start.date);
            const diffDays = Math.floor((eventDate - now) / (1000 * 60 * 60 * 24));
            
            const desc = event.description || '';
            const nameMatch = event.summary.match(/Marriage - (.+)/);
            const mobileMatch = desc.match(/Mobile Number: (\d+)/);
            
            const name = nameMatch ? nameMatch[1] : 'Customer';
            const mobile = mobileMatch ? mobileMatch[1] : null;
            const notificationId = `${event.id}_${diffDays}`;
            
            // --- LOGIC: Check Description Flags ---
            
            // 1. Before 2 Days
            if (diffDays === 2) {
                if (desc.includes("before 2 day reminder done")) return; // Skip if done
                
                notifications.push({
                    id: notificationId,
                    type: 'reminder',
                    eventId: event.id,
                    name: name,
                    mobile: mobile,
                    date: eventDate,
                    daysText: 'நாளை மறுநாள்',
                    diffDays: 2,
                    flag: "before 2 day reminder done" // Tag to add when clicked
                });
            }
            
            // 2. Before 1 Day (Tomorrow) or Today (0)
            if (diffDays === 1 || diffDays === 0) {
                if (desc.includes("before 1 day reminder done")) return; // Skip if done
                
                const dText = diffDays === 0 ? 'இன்று' : 'நாளை';
                notifications.push({
                    id: notificationId,
                    type: 'reminder',
                    eventId: event.id,
                    name: name,
                    mobile: mobile,
                    date: eventDate,
                    daysText: dText,
                    diffDays: diffDays,
                    flag: "before 1 day reminder done" // Tag to add when clicked
                });
            }
            
            // 3. After 1 Day (Thank You) - Checks yesterday (-1) or day before (-2)
            if (diffDays >= -2 && diffDays < 0) {
                if (desc.includes("after 1 day thank reminder done")) return; // Skip if done
                
                const dText = diffDays === -1 ? 'நேற்று' : 'நேற்று முந்தைய நாள்';
                notifications.push({
                    id: notificationId,
                    type: 'thank',
                    eventId: event.id,
                    name: name,
                    mobile: mobile,
                    date: eventDate,
                    daysText: dText,
                    diffDays: diffDays,
                    flag: "after 1 day thank reminder done" // Tag to add when clicked
                });
            }
        });
        
        renderNotifications();
        
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}
// Handles "Mark Done" / Dismiss click
function handleNotificationDismiss(eventId, flag) {
    if(confirm('Mark this notification as done? This will update the Calendar event.')) {
        markNotificationAsDone(eventId, flag);
    }
}
function dismissNotification(notificationId) {
    dismissedNotifications.push(notificationId);
    saveToLocalStorage('dismissedNotifications', dismissedNotifications);
    
    notifications = notifications.filter(n => n.id !== notificationId);
    renderNotifications();
}

function sendReminderWhatsApp(notificationId, name, mobile, dateStr, daysText) {
    if (!mobile || mobile === 'null') {
        showAlert('Error', 'Mobile number not available for this customer');
        return;
    }
    
    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString('ta-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const formattedTime = date.toLocaleTimeString('ta-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    let mobileNum = mobile.replace(/^0+/, '');
    if (!mobileNum.startsWith('91')) mobileNum = '91' + mobileNum;

    const message = `🔔💐 *திருமண விழா நினைவூட்டல்* 💐🔔\n\nஅன்புள்ள *${name}* அவர்களுக்கு,\n\nஉங்கள் இனிய திருமண விழா ${daysText} சிறப்பாக நடைபெற உள்ளது 🎉\n\n📅 தேதி: ${formattedDate}\n🕒 நேரம்: ${formattedTime}\n\nஎங்கள் *காவேரி திருமண மண்டபத்தில்* உங்கள் விழா சிறப்பாக நடைபெற அனைத்து ஏற்பாடுகளும் தயார் நிலையில் உள்ளது.\n\n📞 99446 45441\n\n🙏 நன்றி!`;

    const url = `https://wa.me/${mobileNum}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    
    // AUTO MARK AS DONE after sending
    markNotificationAsDone(eventId, flag);
}

function sendThankYouWhatsApp(eventId, name, mobile, flag) {
    if (!mobile || mobile === 'null') {
        showAlert('Error', 'Mobile number not available');
        return;
    }
    
    let mobileNum = mobile.replace(/^0+/, '');
    if (!mobileNum.startsWith('91')) mobileNum = '91' + mobileNum;

    const message = `🙏 *மனமார்ந்த நன்றி* 🙏\n\nஅன்புள்ள *${name}* அவர்களுக்கு,\n\nஉங்கள் இனிய திருமண விழா நன்றாக நடைபெற்றது 🎊\nஎங்களை தேர்வு செய்ததற்கு மனமார்ந்த நன்றி.\n\n🌺 *காவேரி திருமண மண்டபம்*\n📞 தொடர்புக்கு: 99446 45441\n\n✨ இனிய வாழ்த்துக்கள்!`;

    const url = `https://wa.me/${mobileNum}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');

    // AUTO MARK AS DONE after sending
    markNotificationAsDone(eventId, flag);
}

document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('notificationDropdown');
    const btn = document.getElementById('notificationBtn');
    
    if (dropdown && dropdown.classList.contains('show')) {
        if (!dropdown.contains(event.target) && !btn.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    }
});

/* GOOGLE AUTH & CALENDAR */
function gapiLoaded() {
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: DISCOVERY_DOCS,
            });
            gapiInited = true;
            console.log('✅ Google API initialized');
            
            // CHECK: Is there a stored token?
            const savedToken = getFromLocalStorage('accessToken');
            const savedEmail = getFromLocalStorage('userEmail');

            if (savedToken && savedEmail) {
                // Restore token
                gapi.client.setToken({ access_token: savedToken });
                
                // Verify if token is still valid by making a small call or just loading dashboard
                console.log('🔄 Restoring session, loading dashboard...');
                
                // Show dashboard logic if on dashboard section
                if(document.getElementById('dashboardSection').style.display !== 'none' || 
                   document.getElementById('bookingSection').style.display === 'none') {
                    showDashboard(); 
                }
            }

        } catch (error) {
            console.error('Error initializing Google API:', error);
            // If token is invalid (401), it might fail here or in fetchBookings. 
            // Better to let fetchBookings handle the 401 error.
        }
    });
}

function gisLoaded() {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '',
        });
        gisInited = true;
        console.log('Google Identity Services initialized');
    } catch (error) {
        console.error('Error initializing Google Identity Services:', error);
    }
}

function checkGoogleLibraryStatus() {
    // FIX: If already logged in (from localStorage), do NOT touch the button
    if (userEmail) return; 

    const btn = document.getElementById('googleSignInBtn');
    const loader = document.getElementById('btnLoader');
    const txt = document.getElementById('btnText');

    const timer = setInterval(() => {
        // Double check inside the timer too
        if (userEmail) {
            clearInterval(timer);
            return;
        }

        if (gapiInited && gisInited) {
            btn.classList.remove('disabled');
            btn.removeAttribute('disabled');
            loader.classList.remove('fa-spinner', 'fa-spin');
            loader.classList.add('fa-google');
            txt.innerText = "Sign in with Google";
            
            // Ensure the click triggers login, not dropdown
            btn.onclick = handleAuthClick; 
            
            clearInterval(timer);
        }
    }, 500);

    // Timeout fallback
    setTimeout(() => {
        if ((!gapiInited || !gisInited) && !userEmail) {
            clearInterval(timer);
            loader.classList.remove('fa-spinner', 'fa-spin');
            loader.classList.add('fa-exclamation-triangle');
            txt.innerText = "Calendar Unavailable";
        }
    }, 10000);
}

function handleAuthClick() {
    if(!gapiInited || !gisInited) {
        showAlert('Calendar Setup', 'Google Calendar integration is optional.');
        return;
    }

    tokenClient.callback = async (resp) => {
        if (resp.error) {
            console.error('Auth error:', resp);
            showAlert('Authentication Failed', 'Could not connect to Google Calendar.');
            return;
        }
        
        try {
            // Save token
            saveToLocalStorage('accessToken', resp.access_token);
            
            // Get user info
            const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${resp.access_token}` }
            });
            const info = await userInfoResponse.json();
            
            userEmail = info.email;
            userInfo = info;
            
            saveToLocalStorage('userEmail', userEmail);
            saveToLocalStorage('userInfo', userInfo);
            
            updateSignInButton(userEmail, userInfo);
            showAlert('Success', 'Logged in successfully!');
            
            setTimeout(() => showDashboard(), 1000);
        } catch (error) {
            console.error('Error:', error);
            showAlert('Error', 'Could not retrieve user information.');
        }
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

/* ENHANCED WHATSAPP WITH LOADER */
function openWhatsApp() {
    let mobile = document.getElementById('mobileNumber').value;
    const name = document.getElementById('marriagePersonName').value;
    const fromDateTime = document.getElementById('fromDateTime').value;
    const toDateTime = document.getElementById('toDateTime').value;
    const marriageDate = document.getElementById('marriageDate').value;
    const bookingDate = document.getElementById('bookingDate').value;
    
    if (!mobile || mobile.length < 10) {
        showAlert('Error', 'Please enter a valid mobile number');
        return;
    }
    
    // Show loader on success modal WhatsApp button
    const whatsappBtns = document.querySelectorAll('.submit-btn[style*="25D366"]');
    whatsappBtns.forEach(btn => {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening WhatsApp...';
    });
    
    mobile = mobile.replace(/^0+/, '');
    if (!mobile.startsWith('91')) {
        mobile = '91' + mobile;
    }
    
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ta-IN', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
        });
    };
    
    const formatDateTime = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleString('ta-IN', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const fromStr = formatDateTime(fromDateTime);
    const toStr = formatDateTime(toDateTime);
    const marriageDateStr = formatDate(marriageDate);
    const bookingDateStr = formatDate(bookingDate);

    let message = `🌸 *காவேரி திருமண மண்டபம்* 🌸\n`;
    message += `*Cauvery Wedding Hall*\n\n`;
    message += `📄 *முன்பதிவு ரசீது (Booking Receipt)*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `📅 *முன்பதிவு தேதி:* ${bookingDateStr}\n`;
    message += `💍 *திருமண தேதி:* ${marriageDateStr}\n\n`;
    
    message += `🕒 *நிகழ்ச்சி நேரம்:*\n`;
    message += `   ${fromStr} ⏩\n`;
    message += `   ${toStr} வரை\n\n`;
    
    message += `👤 *பெயர்:* ${name}\n\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 *கட்டண விவரங்கள்*\n\n`;
    
    message += `💰 *மண்டபம் வாடகை:* ₹${bookingData.totalHall.toLocaleString('en-IN')}\n`;
    message += `💵 *முன்பணம்:* ₹${bookingData.advance.toLocaleString('en-IN')}\n`;
    message += `📌 *பாக்கி தொகை:* ₹${bookingData.pendingHall.toLocaleString('en-IN')}\n\n`;
    
    let hasServices = false;
    let servicesText = '';
    
    if (bookingData.fees.cleaning > 0) {
        servicesText += `🧹 *கிளீனிங்:* ₹${bookingData.fees.cleaning.toLocaleString('en-IN')}\n`;
        hasServices = true;
    }
    if (bookingData.fees.ac > 0) {
        servicesText += `❄️ *AC அறை:* ₹${bookingData.fees.ac.toLocaleString('en-IN')}\n`;
        hasServices = true;
    }
    if (bookingData.fees.lights > 0) {
        servicesText += `💡 *சீரியல் லைட்:* ₹${bookingData.fees.lights.toLocaleString('en-IN')}\n`;
        hasServices = true;
    }
    if (bookingData.fees.speaker > 0) {
        servicesText += `🔊 *ஸ்பீக்கர்:* ₹${bookingData.fees.speaker.toLocaleString('en-IN')}\n`;
        hasServices = true;
    }
    if (bookingData.fees.ilai > 0) {
        servicesText += `🍽️ *சாப்பாடு இலை எடுத்தல்:* ₹${bookingData.fees.ilai.toLocaleString('en-IN')}\n`;
        hasServices = true;
    }
    if (bookingData.fees.waterCan > 0) {
        servicesText += `💧 *கேன் வாட்டர்:* ₹${bookingData.fees.waterCan.toLocaleString('en-IN')}\n`;
        hasServices = true;
    }
    
    if (bookingData.fees.others && bookingData.fees.others.length > 0) {
        bookingData.fees.others.forEach(other => {
            servicesText += `✨ *${other.title}:* ₹${other.amount.toLocaleString('en-IN')}\n`;
            hasServices = true;
        });
    }
    
    if (hasServices) {
        message += `✨ *கூடுதல் சேவைகள்:*\n`;
        message += servicesText;
        message += `\n`;
    }
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `🧾 *மொத்த தொகை:* ₹${bookingData.finalTotal.toLocaleString('en-IN')}\n\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📌 *முக்கிய குறிப்பு:*\n\n`;
    
    message += `⚡ *கரெண்ட் பில்:* ₹30 / யூனிட் (தனியாக)\n`;
    message += `🌺 *மற்ற அனைத்து செலவுகளும் வாடிக்கையாளர் பொறுப்பு*\n`;
    message += `💧 *கேன் வாட்டர் குறைந்த விலையில் கிடைக்கும்*\n`;
    message += `📞 *கூடுதல் வசதி தேவைப்பட்டால் 1 வாரத்திற்கு முன் தெரிவிக்கவும்*\n`;
    message += `⚠ *ஜெனரேட்டர் வசதி இல்லை*\n\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    if (finalPdfLink) {
        message += `📄 *முழு ரசீது பதிவிறக்கம்:*\n${finalPdfLink}\n\n`;
    }
    
    message += `🙏 *எங்களை தேர்வு செய்ததற்கு நன்றி!*\n\n`;
    message += `📞 தொடர்புக்கு: 99446 45441\n\n`;
    message += `💐 *உங்கள் திருமண விழா இனிமையுடன், சந்தோஷமாக நடைபெற வாழ்த்துக்கள்!*`;

    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${mobile}?text=${encodedMessage}`;
    
    // Open WhatsApp
    setTimeout(() => {
        window.open(url, '_blank');
        
        // Reset button after 2 seconds
        setTimeout(() => {
            whatsappBtns.forEach(btn => {
                btn.disabled = false;
                btn.innerHTML = '<i class="fab fa-whatsapp"></i> Send to Customer';
            });
        }, 2000);
    }, 500);
}

/* FORM SUBMISSION */
async function handlePreviewPDF() {
    if (!validateAllFields()) {
        showAlert('Validation Error', 'Please fix all errors before previewing.');
        const firstError = document.querySelector('.invalid');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    try {
        populatePDFTemplate();

        const previewContent = document.getElementById('pdf-template').cloneNode(true);
        previewContent.style.position = 'static';
        previewContent.style.visibility = 'visible';
        previewContent.style.left = 'auto';
        previewContent.style.transform = 'scale(0.8)';
        previewContent.style.transformOrigin = 'top center';
        
        const previewContainer = document.createElement('div');
        previewContainer.id = 'preview-container';
        previewContainer.style.cssText = 'overflow: auto; background: #f5f5f5; padding: 20px; border-radius: 8px;';
        previewContainer.appendChild(previewContent);
        
        const previewBody = document.querySelector('.preview-body');
        previewBody.innerHTML = '';
        previewBody.appendChild(previewContainer);
        
        showModal('pdfPreviewModal');

    } catch (error) {
        console.error('Preview error:', error);
        showAlert('Preview Error', 'Could not generate preview.');
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    // 1. Force Recalculation of all totals to ensure bookingData is fresh
    calculateTotal(); 

    // 2. Validate Inputs
    if (!validateAllFields()) {
        showAlert('Validation Error', 'Please fix all errors before submitting.');
        return;
    }

    // 3. Check if this is an Update or New Booking
    const editId = document.getElementById('editEventId').value;
    
    showModal('loadingModal');

    try {
        if (!gapiInited || !gapi.client.getToken()) {
            throw new Error("Please sign in with Google first.");
        }

        if (editId) {
            // --- UPDATE FLOW ---
            console.log("Updating Event ID:", editId);
            await updateCalendarEvent(editId);
            
            hideModal('loadingModal');
            showSuccessAlert("Updated!", "Booking details updated successfully.");
            
            // Generate PDF for the updated booking so it's ready for WhatsApp
            // await generatePDF(); 
            
            // Reset to dashboard after short delay
            setTimeout(() => {
                cancelEdit(); // Clears form and returns to dashboard
            }, 2000);

        } else {
            // --- CREATE FLOW ---
            console.log("Creating New Event");
            await addToCalendar();
            
            // Generate and Upload PDF
            const pdfData = await generatePDF();
            finalPdfLink = await uploadToDrive(pdfData.blob, pdfData.fileName);
            
            // Update the calendar event with the PDF link if we got one
            // (Optional step, handled if you want the link in the calendar description)

            hideModal('loadingModal');
            showModal('successModal');
        }

    } catch (err) {
        console.error('Submission Error:', err);
        hideModal('loadingModal');
        showAlert('Error', 'Operation failed: ' + err.message);
    }
}

function buildEventDescription(name, mobile, city, givenBy) {
    const servicesText = [];
    
    // exact text keys used for parsing later
    if (document.getElementById('cleaningFee').checked) servicesText.push(`Cleaning Fee: ₹${document.getElementById('cleaningFeeAmount').value}`);
    if (document.getElementById('acRooms').checked) servicesText.push(`AC Rooms: ₹${document.getElementById('acRoomsAmount').value}`);
    if (document.getElementById('serialLights').checked) servicesText.push(`Serial Lights: ₹${document.getElementById('serialLightsAmount').value}`);
    if (document.getElementById('speaker').checked) servicesText.push(`Speaker: ₹${document.getElementById('speakerAmount').value}`);
    if (document.getElementById('sapaduIlai').checked) servicesText.push(`Sapadu Ilai: ₹${document.getElementById('sapaduIlaiAmount').value}`);
    if (document.getElementById('waterCan').checked) servicesText.push(`Water Can: ₹${document.getElementById('waterCanAmount').value}`);
    
    // Dynamic 'Others'
    if (bookingData.fees.others && bookingData.fees.others.length > 0) {
        bookingData.fees.others.forEach(other => {
            servicesText.push(`Other-${other.title}: ₹${other.amount}`);
        });
    }
    
    let status = 'UPCOMING';
    const statusField = document.getElementById('bookingStatus');
    if (statusField && statusField.offsetParent !== null) {
        status = statusField.value;
    }

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       CAUVERY WEDDING HALL BOOKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 CUSTOMER DETAILS:
Marriage Person: ${name}
Mobile Number: ${mobile}
Customer City: ${city}
Booked By: ${givenBy}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 PAYMENT DETAILS:
Total Hall Amount: ₹${bookingData.totalHall}
Advance Paid: ₹${bookingData.advance}
Pending Hall Amount: ₹${bookingData.pendingHall}
Hall Settled: ${bookingData.hallSettled ? 'YES' : 'NO'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 ADDITIONAL SERVICES:
${servicesText.length > 0 ? servicesText.join('\n') : 'No additional services selected'}

Total Addons Amount: ₹${bookingData.totalAddons}
Pending Addons Amount: ₹${bookingData.pendingAddons}
Addons Settled: ${bookingData.addonsSettled ? 'YES' : 'NO'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧾 GRAND TOTALS:
Total Bill Value: ₹${bookingData.finalTotal}
Total Pending Amount: ₹${bookingData.totalPending}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 IMPORTANT NOTES:
⚡ Electricity Bill Extra: ₹30 / Unit
💧 Can water available at low cost
📞 Contact: +91 99446 45441
⚠️  No Generator facility

STATUS: ${status}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();
}

async function addToCalendar() {
    if (!tokenClient || !gapi.client.calendar) {
        throw new Error("Google Calendar API is not loaded");
    }
    const getTxt = (id) => document.getElementById(id).value;
    const name = getTxt('marriagePersonName');
    const mobile = getTxt('mobileNumber');
    const city = getTxt('customerFrom');
    const givenBy = getTxt('amountGivenBy');
    
    const desc = buildEventDescription(name, mobile, city, givenBy);

    const event = {
        'summary': `Marriage - ${name}`,
        'description': desc,
        'location': 'Cauvery Wedding Hall, Tamil Nadu',
        'start': {
            'dateTime': new Date(getTxt('fromDateTime')).toISOString(),
            'timeZone': 'Asia/Kolkata'
        },
        'end': {
            'dateTime': new Date(getTxt('toDateTime')).toISOString(),
            'timeZone': 'Asia/Kolkata'
        },
        'reminders': {
            'useDefault': false,
            'overrides': [
                {'method': 'email', 'minutes': 24 * 60},
                {'method': 'popup', 'minutes': 60}
            ]
        }
    };

    await gapi.client.calendar.events.insert({
        'calendarId': 'primary',
        'resource': event
    });
}

async function updateCalendarEvent(eventId) {
    // 1. Helper to get values
    const getTxt = (id) => document.getElementById(id).value;
    
    // 2. Get fresh data from Form
    const name = getTxt('marriagePersonName');
    const mobile = getTxt('mobileNumber');
    const city = getTxt('customerFrom');
    const givenBy = getTxt('amountGivenBy');
    
    // 3. Generate Description using the Global 'bookingData' 
    // (which was refreshed by calculateTotal() in handleFormSubmit)
    const desc = buildEventDescription(name, mobile, city, givenBy);

    // 4. Construct Event Object
    const event = {
        'summary': `Marriage - ${name}`,
        'description': desc,
        'location': 'Cauvery Wedding Hall, Tamil Nadu',
        'start': {
            'dateTime': new Date(getTxt('fromDateTime')).toISOString(),
            'timeZone': 'Asia/Kolkata'
        },
        'end': {
            'dateTime': new Date(getTxt('toDateTime')).toISOString(),
            'timeZone': 'Asia/Kolkata'
        },
        'reminders': {
            'useDefault': false,
            'overrides': [
                {'method': 'email', 'minutes': 24 * 60},
                {'method': 'popup', 'minutes': 60}
            ]
        }
    };

    // 5. Send to Google Calendar
    try {
        await gapi.client.calendar.events.update({
            'calendarId': 'primary',
            'eventId': eventId,
            'resource': event
        });
        console.log("Calendar Event Updated Successfully");
    } catch (error) {
        console.error("Google Calendar Update Failed:", error);
        throw new Error("Failed to update Google Calendar.");
    }
}

function populatePDFTemplate() {
    const getTxt = (id) => document.getElementById(id).value;
    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
        });
    };

    const formatDateTime = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleString('en-IN', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    setTxt('pdf_marriageDate', formatDate(getTxt('marriageDate')));
    setTxt('pdf_bookingDate', formatDate(getTxt('bookingDate')));
    setTxt('pdf_name', getTxt('marriagePersonName'));
    setTxt('pdf_from', formatDateTime(getTxt('fromDateTime')));
    setTxt('pdf_to', formatDateTime(getTxt('toDateTime')));

    setTxt('pdf_hall', bookingData.totalHall.toLocaleString('en-IN'));
    setTxt('pdf_advance', bookingData.advance.toLocaleString('en-IN'));
    setTxt('pdf_pending', bookingData.pendingHall.toLocaleString('en-IN'));
    setTxt('pdf_final', bookingData.finalTotal.toLocaleString('en-IN'));

    setTxt('pdf_givenBy', getTxt('amountGivenBy'));
    setTxt('pdf_city', getTxt('customerFrom'));
    setTxt('pdf_mobile', getTxt('mobileNumber'));

    const list = document.getElementById('pdf_services_list');
    list.innerHTML = '';
    const addService = (label, amt) => {
        if (amt > 0) {
            const div = document.createElement('div');
            div.className = 'service-item';
            div.innerHTML = `<span>${label}</span><span>₹ ${amt.toLocaleString('en-IN')}</span>`;
            list.appendChild(div);
        }
    };

    addService('🧹 கிளீனிங் கட்டணம் (Cleaning)', bookingData.fees.cleaning);
    addService('❄️ AC அறை கட்டணம் (AC Rooms)', bookingData.fees.ac);
    addService('💡 சீரியல் லைட் கட்டணம் (Serial Lights)', bookingData.fees.lights);
    addService('🔊 ஸ்பீக்கர் கட்டணம் (Speaker)', bookingData.fees.speaker);
    addService('🍃 சாப்பாடு இலை எடுத்தல் (remove wastage)', bookingData.fees.ilai);
    addService('💧 கேன் வாட்டர் (Water Can)', bookingData.fees.waterCan);
    
    if(bookingData.fees.others && bookingData.fees.others.length > 0) {
        bookingData.fees.others.forEach(other => {
            addService(`✨ ${other.title}`, other.amount);
        });
    }

    if (list.innerHTML === '') {
        list.innerHTML = '<p style="color: #999; font-style: italic; margin: 0;">No additional services selected</p>';
    }
}

function generatePDF() {
    return new Promise((resolve, reject) => {
        try {
            populatePDFTemplate();

            const element = document.getElementById('pdf-template');
            const fileName = `Cauvery_Booking_${document.getElementById('marriagePersonName').value.replace(/\s+/g, '_')}.pdf`;
            const opt = {
                margin: [10, 10, 10, 10],
                filename: fileName,
                image: { type: 'jpeg', quality: 1 },
                html2canvas: { 
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    letterRendering: true,
                    scrollY: 0,
                    scrollX: 0
                },
                jsPDF: { 
                    unit: 'mm', 
                    format: 'a4', 
                    orientation: 'portrait',
                    compress: true
                },
                pagebreak: { 
                    mode: ['avoid-all', 'css', 'legacy'],
                    avoid: '.pdf-page'
                }
            };

            html2pdf().set(opt).from(element).output('blob').then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                
                resolve({ blob, fileName });
            });

        } catch (error) {
            console.error('PDF preparation error:', error);
            reject(error);
        }
    });
}

async function uploadToDrive(pdfBlob, fileName) {
    try {
        const metadata = {
            'name': fileName,
            'mimeType': 'application/pdf'
        };

        const accessToken = gapi.client.getToken().access_token;
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', pdfBlob);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });
        
        if (!response.ok) {
            throw new Error(`Drive Upload Failed`);
        }

        const file = await response.json();

        if (file.id) {
            await gapi.client.drive.permissions.create({
                fileId: file.id,
                resource: {
                    role: 'reader',
                    type: 'anyone'
                }
            });
        }

        return file.webViewLink;

    } catch (error) {
        console.error("Drive Upload Error:", error);
        return null; 
    }
}

/* DASHBOARD & BOOKING MANAGEMENT - COMPLETE */
async function fetchBookings() {
    const tbody = document.getElementById('bookingsTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center"><div class="spinner" style="width:30px;height:30px;border-width:3px"></div> Loading...</td></tr>';

    try {
        // Check if GAPI is ready
        if (!gapiInited || !gapi.client.calendar) {
            throw new Error('Google API not ready');
        }

        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': (new Date()).toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'maxResults': 250, 
            'orderBy': 'startTime'
        });

        // ... existing mapping logic ...
        const events = response.result.items;
       
        allBookings = events
            .filter(e => e.summary && e.summary.includes('Marriage'))
            .map(event => {
                 // ... keep your existing mapping logic here ...
                 // Copy the content inside the .map() from your original code
                 const start = new Date(event.start.dateTime || event.start.date);
                 const desc = event.description || "";
                 const mobileMatch = desc.match(/Mobile Number: (\d+)/);
                 const cityMatch = desc.match(/Customer City: (.*)/);
                 return {
                    id: event.id,
                    dateObj: start,
                    dateStr: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                    timeStr: start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                    name: event.summary.replace('Marriage - ', ''),
                    mobile: mobileMatch ? mobileMatch[1] : 'N/A',
                    city: cityMatch ? cityMatch[1].trim() : 'N/A',
                    fullEvent: event
                 };
            });

        filteredBookings = [...allBookings];
        currentPage = 1;
        renderTable();

    } catch (err) {
        console.error(err);
        if(err.status === 401 || err.result?.error?.code === 401) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color:red">Session expired. Please <a href="#" onclick="handleAuthClick()">Sign In again</a>.</td></tr>';
            // Optional: Auto logout if 401
            // clearLocalStorage();
            // updateSignInButton('', null);
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color:red">Error loading data. ' + (err.message || '') + '</td></tr>';
        }
    }
}

function handleSearch(e) {
    const term = e.target.value.toLowerCase().trim();
    
    filteredBookings = allBookings.filter(booking => {
        // 1. Search by Name
        const nameMatch = booking.name.toLowerCase().includes(term);
        
        // 2. Search by Mobile
        const mobileMatch = booking.mobile.includes(term);
        
        // 3. Search by City
        const cityMatch = booking.city.toLowerCase().includes(term);
        
        // 4. Search by Date String (This enables "Feb", "17 Feb", "2025", etc.)
        // This works because booking.dateStr is formatted like "17 Feb 2026"
        const dateMatch = booking.dateStr.toLowerCase().includes(term);

        // Return true if ANY of these match
        return nameMatch || mobileMatch || cityMatch || dateMatch;
    });

    currentPage = 1;
    renderTable();
}

function handleRowsChange(e) {
    let val = parseInt(e.target.value);
    if(val < 1) val = 1;
    rowsPerPage = val;
    currentPage = 1;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('bookingsTableBody');
    tbody.innerHTML = '';

    if (filteredBookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No bookings found.</td></tr>';
        document.getElementById('paginationControls').innerHTML = '';
        return;
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredBookings.slice(start, end);

    pageData.forEach(booking => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${booking.dateStr}</strong></td>
            <td>${booking.name}</td>
            <td>${booking.timeStr}</td>
            <td class="details-cell">
                <span>${booking.mobile}</span>
                <small>${booking.city}</small>
            </td>
            <td>
                <div class="action-btn-group">
                    <button class="icon-btn btn-view" onclick="viewBooking('${booking.id}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="icon-btn btn-edit" onclick="editBooking('${booking.id}')" title="Edit">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="icon-btn btn-whatsapp" onclick="openWhatsAppFromDashboard('${booking.id}')" title="WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                    <button class="icon-btn btn-download" onclick="downloadBookingPdf('${booking.id}')" title="Download">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                    <button class="icon-btn btn-expense" onclick="openExpenseModal('${booking.id}')" title="Expenses">
                        <i class="fas fa-money-bill-wave"></i>
                    </button>
                    <button class="icon-btn btn-delete" onclick="deleteBooking('${booking.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderPagination();
}

function renderPagination() {
    const container = document.getElementById('paginationControls');
    container.innerHTML = '';

    const totalPages = Math.ceil(filteredBookings.length / rowsPerPage);
    if (totalPages <= 1) return;

    const createBtn = (text, page, isActive = false, isDisabled = false) => {
        const btn = document.createElement('button');
        btn.className = `page-btn ${isActive ? 'active' : ''}`;
        btn.innerText = text;
        btn.disabled = isDisabled;
        btn.onclick = () => {
            currentPage = page;
            renderTable();
        };
        return btn;
    };

    container.appendChild(createBtn('« Prev', currentPage - 1, false, currentPage === 1));

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            container.appendChild(createBtn(i, i, i === currentPage));
        } else if (
            (i === currentPage - 2 && currentPage > 3) || 
            (i === currentPage + 2 && currentPage < totalPages - 2)
        ) {
            const dots = document.createElement('span');
            dots.innerText = '...';
            dots.style.padding = '8px';
            container.appendChild(dots);
        }
    }

    container.appendChild(createBtn('Next »', currentPage + 1, false, currentPage === totalPages));
}

async function viewBooking(eventId) {
    // Reuse editBooking logic to populate form
    await editBooking(eventId);

    // Then disable everything
    const inputs = document.querySelectorAll('#bookingForm input, #bookingForm select, #bookingForm textarea, #bookingForm button');
    inputs.forEach(input => {
        // Keep cancel button enabled
        if (input.id !== 'cancelEditBtn') input.disabled = true;
    });

    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('previewPdfBtn').style.display = 'none';
    
    const cancelBtn = document.getElementById('cancelEditBtn');
    cancelBtn.innerText = "Close View";
    cancelBtn.disabled = false;
    
    document.querySelector('.form-header h3').innerText = "View Booking Details";
}

async function editBooking(eventId) {
    showModal('loadingModal');
    
    try {
        showBookingForm();
        
        const response = await gapi.client.calendar.events.get({
            'calendarId': 'primary',
            'eventId': eventId
        });
        const event = response.result;
        const desc = event.description || "";

        document.getElementById('editEventId').value = eventId;

        // --- Helper Regex ---
        const extract = (label) => {
            const regex = new RegExp(`${label}: (.*?)(\\n|$)`);
            const match = desc.match(regex);
            return match ? match[1].trim() : '';
        };
        const cleanAmt = (val) => val ? parseFloat(val.replace(/[₹,]/g, '')) || 0 : 0;

        // 1. Basic Fields
        document.getElementById('marriagePersonName').value = event.summary.replace('Marriage - ', '');
        document.getElementById('mobileNumber').value = extract('Mobile Number');
        document.getElementById('customerFrom').value = extract('Customer City');
        document.getElementById('amountGivenBy').value = extract('Booked By');

        // 2. Dates
        if(event.start && event.start.dateTime) {
            const start = new Date(event.start.dateTime);
            const end = new Date(event.end.dateTime);
            const toLocalISO = (date) => {
                const offset = date.getTimezoneOffset() * 60000;
                return new Date(date.getTime() - offset).toISOString().slice(0, 16);
            };
            document.getElementById('fromDateTime').value = toLocalISO(start);
            document.getElementById('toDateTime').value = toLocalISO(end);
            document.getElementById('marriageDate').value = start.toISOString().split('T')[0];
            document.getElementById('bookingDate').value = toLocalISO(new Date()); 
        }

        // 3. Hall Payments
        document.getElementById('totalHallAmount').value = cleanAmt(extract('Total Hall Amount'));
        document.getElementById('advanceAmount').value = cleanAmt(extract('Advance Paid'));
        const hallSettled = extract('Hall Settled');
        document.getElementById('hallSettled').checked = (hallSettled === 'YES');

        // 4. CHECKBOXES (Safe Check)
        // Checks if the label exists in description OR if amount > 0 was saved previously
        const hasText = (txt) => desc.includes(txt);
        document.getElementById('cleaningFee').checked = hasText('Cleaning Fee') || hasText('Cleaning:');
        document.getElementById('acRooms').checked = hasText('AC Rooms');
        document.getElementById('serialLights').checked = hasText('Serial Lights');
        document.getElementById('speaker').checked = hasText('Speaker');
        document.getElementById('sapaduIlai').checked = hasText('Sapadu Ilai');
        document.getElementById('waterCan').checked = hasText('Water Can');

        // 5. RESTORE OTHERS (CRITICAL FIX)
        document.getElementById('othersContainer').innerHTML = ''; 
        otherServiceCount = 0; // <--- THIS LINE FIXES THE CRASH
        document.getElementById('others').checked = false;
        
        // Find lines starting with "Other-" or look for patterns like "Title: ₹Amount"
        // We look for the pattern used in buildEventDescription: "Other-Title: ₹Amount"
        const otherMatches = desc.match(/Other-(.*?): ₹([\d,]+)/g);
        
        if (otherMatches && otherMatches.length > 0) {
            document.getElementById('others').checked = true;
            document.getElementById('othersFields').style.display = 'block';
            
            otherMatches.forEach(match => {
                // Extract Title and Amount safely
                const parts = match.match(/Other-(.*?): ₹([\d,]+)/);
                if (parts) {
                    const title = parts[1].trim();
                    const amount = parseFloat(parts[2].replace(/,/g, ''));
                    addOtherService(title, amount); 
                }
            });
        } else {
             document.getElementById('othersFields').style.display = 'none';
        }

        // 6. Addon Totals & Status
        document.getElementById('totalAddonsAmount').value = cleanAmt(extract('Total Addons Amount'));
        document.getElementById('pendingAddonsAmount').value = cleanAmt(extract('Pending Addons Amount'));
        const addonsSettled = extract('Addons Settled');
        document.getElementById('addonsSettled').checked = (addonsSettled === 'YES');

        // 7. Status
        const statusGroup = document.getElementById('statusGroup');
        const statusField = document.getElementById('bookingStatus');
        statusGroup.style.display = 'block';
        const statusMatch = desc.match(/STATUS: (.+)/);
        if (statusMatch) statusField.value = statusMatch[1].trim();

        // 8. Update UI
        const submitBtn = document.getElementById('submitBtn');
        // IMPORTANT: Use innerHTML to set the icon AND text correctly
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Booking';
        submitBtn.style.display = 'inline-flex';
        
        document.getElementById('cancelEditBtn').style.display = 'inline-block';
        document.querySelector('.form-header h3').innerText = "Edit Booking";

        // 9. Recalculate Totals (Now safe because count is reset)
        calculateTotal();
        
        hideModal('loadingModal');

    } catch (error) {
        console.error("Edit Error:", error);
        hideModal('loadingModal');
        showAlert("Error", "Could not load booking details.");
    }
}

async function downloadBookingPdf(eventId) {
    showModal('loadingModal');
    
    try {
        const response = await gapi.client.calendar.events.get({
            'calendarId': 'primary',
            'eventId': eventId
        });
        const event = response.result;

        const desc = event.description || "";
        const extract = (label) => {
            const regex = new RegExp(`${label}: (.*?)(\\n|$)`);
            const match = desc.match(regex);
            return match ? match[1].trim() : '';
        };

        const cleanAmt = (val) => {
            if (!val) return 0;
            return parseFloat(val.replace(/[₹,]/g, '')) || 0;
        };

        document.getElementById('marriagePersonName').value = event.summary.replace('Marriage - ', '');
        document.getElementById('mobileNumber').value = extract('Mobile Number') || '';
        document.getElementById('customerFrom').value = extract('Customer City') || '';
        document.getElementById('amountGivenBy').value = extract('Booked By') || '';

        if(event.start && event.start.dateTime) {
            const start = new Date(event.start.dateTime);
            const end = new Date(event.end.dateTime);
            
            const formatDateTime = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}T${hours}:${minutes}`;
            };
            
            document.getElementById('fromDateTime').value = formatDateTime(start);
            document.getElementById('toDateTime').value = formatDateTime(end);
            document.getElementById('marriageDate').value = start.toISOString().split('T')[0];
        }

        document.getElementById('totalHallAmount').value = cleanAmt(extract('Total Hall Amount'));
        document.getElementById('advanceAmount').value = cleanAmt(extract('Advance Paid'));

        calculateTotal();

        await new Promise(resolve => setTimeout(resolve, 300));

        await generatePDF();
        
        hideModal('loadingModal');
        
    } catch (error) {
        console.error("Download Error:", error);
        hideModal('loadingModal');
        showAlert("Error", "Could not generate PDF.");
    }
}

async function deleteBooking(eventId) {
    const isConfirmed = confirm("⚠️ Are you sure you want to DELETE this booking?\n\nThis action cannot be undone.");

    if (isConfirmed) {
        showModal('loadingModal');
        try {
            await gapi.client.calendar.events.delete({
                'calendarId': 'primary',
                'eventId': eventId
            });

            await fetchBookings();
            
            hideModal('loadingModal');
            showSuccessAlert("Deleted", "Booking has been permanently deleted.");
            
        } catch (error) {
            console.error("Delete Error:", error);
            hideModal('loadingModal');
            showAlert("Error", "Failed to delete booking.");
        }
    }
}

function cancelEdit() {
    // 1. Reset Form
    document.getElementById('bookingForm').reset();
    
    // 2. Clear Edit ID
    document.getElementById('editEventId').value = '';

    // 3. Re-enable all inputs
    const inputs = document.querySelectorAll('#bookingForm input, #bookingForm select, #bookingForm textarea');
    inputs.forEach(input => input.disabled = false);

    // 4. Reset Buttons
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm & Download';
    submitBtn.style.display = 'inline-flex';

    document.getElementById('previewPdfBtn').style.display = 'inline-flex';
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('statusGroup').style.display = 'none';
    
    // 5. Reset Header
    document.querySelector('.form-header h3').innerText = "Wedding Hall Booking Form";

    // 6. Reset State
    setDefaultDate();
    calculateTotal();
    
    // 7. Go to Dashboard
    showDashboard();
}

async function openWhatsAppFromDashboard(eventId) {
    try {
        const response = await gapi.client.calendar.events.get({
            'calendarId': 'primary',
            'eventId': eventId
        });
        const event = response.result;
        
        const desc = event.description || "";
        const extract = (label) => {
            const regex = new RegExp(`${label}: (.*?)(\\n|$)`);
            const match = desc.match(regex);
            return match ? match[1].trim() : '';
        };

        const cleanAmt = (val) => {
            if (!val) return 0;
            return parseFloat(val.replace(/[₹,]/g, '')) || 0;
        };
        
        // Populate form temporarily
        document.getElementById('marriagePersonName').value = event.summary.replace('Marriage - ', '');
        document.getElementById('mobileNumber').value = extract('Mobile Number') || '';
        document.getElementById('customerFrom').value = extract('Customer City') || '';
        document.getElementById('amountGivenBy').value = extract('Booked By') || '';

        if(event.start && event.start.dateTime) {
            const start = new Date(event.start.dateTime);
            const end = new Date(event.end.dateTime);
            
            const formatDateTime = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}T${hours}:${minutes}`;
            };
            
            document.getElementById('fromDateTime').value = formatDateTime(start);
            document.getElementById('toDateTime').value = formatDateTime(end);
            document.getElementById('marriageDate').value = start.toISOString().split('T')[0];
        }

        document.getElementById('totalHallAmount').value = cleanAmt(extract('Total Hall Amount'));
        document.getElementById('advanceAmount').value = cleanAmt(extract('Advance Paid'));

        calculateTotal();
        
        // Call WhatsApp
        openWhatsApp();
        
    } catch (error) {
        console.error('Error:', error);
        showAlert('Error', 'Could not load booking details');
    }
}

/* EXPENSE MANAGEMENT */
async function openExpenseModal(eventId) {
    // 1. Set ID and Reset UI initially
    document.getElementById('expenseEventId').value = eventId;
    document.getElementById('showOthers').checked = false;
    document.getElementById('otherExpensesList').innerHTML = '';
    otherExpenseCount = 0;
    
    // Show loading state inside the modal inputs if you like, or just wait
    // For now, we set them to 0 as placeholders until data loads
    const setVal = (id, val) => document.getElementById(id).value = val;
    setVal('exp_staffSalary', 0);
    setVal('exp_ilaiCleaning', 0);
    setVal('exp_currentBill', 0);
    setVal('exp_purchase', 0);
    setVal('exp_damage', 0);
    setVal('exp_development', 0);
    document.getElementById('totalExpensesDisplay').innerText = "0";

    showModal('expenseModal');
    
    // 2. Fetch Event Data to Populate
    try {
        const response = await gapi.client.calendar.events.get({
            'calendarId': 'primary',
            'eventId': eventId
        });
        const event = response.result;
        const desc = event.description || "";

        // 3. Helper to parse money (e.g., "Staff Salary: ₹5,000")
        const extractExpense = (label) => {
            // Regex looks for "Label: ₹5,000"
            const regex = new RegExp(`${label}: ₹([\\d,]+)`);
            const match = desc.match(regex);
            return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
        };

        // 4. Populate Standard Fields
        setVal('exp_staffSalary', extractExpense('Staff Salary'));
        setVal('exp_ilaiCleaning', extractExpense('Ilai Eduthal & Cleaning'));
        setVal('exp_currentBill', extractExpense('Current Bill'));
        setVal('exp_purchase', extractExpense('Purchase Things'));
        setVal('exp_damage', extractExpense('Damage Recover'));
        setVal('exp_development', extractExpense('New Development'));

        // 5. Populate "Other Expenses"
        // Pattern: "- Title: ₹Amount" under "Other Expenses:" section
        // We look for lines starting with "- " followed by text and an amount
        const otherMatches = desc.match(/- (.*?): ₹([\d,]+)/g);
        
        if (otherMatches && otherMatches.length > 0) {
            document.getElementById('showOthers').checked = true;
            document.getElementById('otherExpensesContainer').style.display = 'block';
            
            otherMatches.forEach(match => {
                const parts = match.match(/- (.*?): ₹([\d,]+)/);
                if (parts) {
                    const title = parts[1].trim();
                    const amount = parseFloat(parts[2].replace(/,/g, ''));
                    addOtherExpense(title, amount);
                }
            });
        }

        // 6. Update Total Display
        calculateTotalExpenses();

    } catch (error) {
        console.error("Error fetching expenses:", error);
        showAlert("Error", "Could not load existing expenses.");
    }
}
function toggleOtherExpenses() {
    const container = document.getElementById('otherExpensesContainer');
    const checkbox = document.getElementById('showOthers');
    
    if (checkbox.checked) {
        container.style.display = 'block';
        if (otherExpenseCount === 0) {
            addOtherExpense();
        }
    } else {
        container.style.display = 'none';
        document.getElementById('otherExpensesList').innerHTML = '';
        otherExpenseCount = 0;
    }
    calculateTotalExpenses();
}

function addOtherExpense(title = '', amount = 0) {
    const container = document.getElementById('otherExpensesList');
    const id = ++otherExpenseCount;
    
    const div = document.createElement('div');
    div.className = 'expense-item';
    div.id = `other_exp_${id}`;
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.alignItems = 'center';
    div.style.marginBottom = '10px';
    
    div.innerHTML = `
        <input type="text" id="other_exp_title_${id}" placeholder="Expense Name" value="${title}" class="fee-input" style="flex: 2;">
        <input type="number" id="other_exp_amount_${id}" value="${amount}" min="0" step="100" placeholder="Amount" class="fee-input" style="flex: 1;" oninput="calculateTotalExpenses()">
        <button type="button" onclick="removeOtherExpense(${id})" class="icon-btn btn-delete" style="width: 35px; height: 35px;">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(div);
    calculateTotalExpenses();
}

function removeOtherExpense(id) {
    const element = document.getElementById(`other_exp_${id}`);
    if (element) {
        element.remove();
    }
    calculateTotalExpenses();
}

function calculateTotalExpenses() {
    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;
    
    let total = 0;
    total += getVal('exp_staffSalary');
    total += getVal('exp_ilaiCleaning');
    total += getVal('exp_currentBill');
    total += getVal('exp_purchase');
    total += getVal('exp_damage');
    total += getVal('exp_development');
    
    if (document.getElementById('showOthers').checked) {
        for (let i = 1; i <= otherExpenseCount; i++) {
            const amountEl = document.getElementById(`other_exp_amount_${i}`);
            if (amountEl) {
                total += parseFloat(amountEl.value) || 0;
            }
        }
    }
    
    document.getElementById('totalExpensesDisplay').innerText = total.toLocaleString('en-IN');
}

async function updateExpenses() {
    showModal('loadingModal');
    
    try {
        const eventId = document.getElementById('expenseEventId').value;
        
        const response = await gapi.client.calendar.events.get({
            'calendarId': 'primary',
            'eventId': eventId
        });
        const event = response.result;
        
        let desc = event.description || "";
        desc = desc.replace(/EXPENSES:[\s\S]*?(?=STATUS:|$)/, '').trim();
        
        const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;
        
        let expenseSection = '\n\nEXPENSES:\n';
        if (getVal('exp_staffSalary') > 0) expenseSection += `Staff Salary: ₹${getVal('exp_staffSalary').toLocaleString('en-IN')}\n`;
        if (getVal('exp_ilaiCleaning') > 0) expenseSection += `Ilai Eduthal & Cleaning: ₹${getVal('exp_ilaiCleaning').toLocaleString('en-IN')}\n`;
        if (getVal('exp_currentBill') > 0) expenseSection += `Current Bill: ₹${getVal('exp_currentBill').toLocaleString('en-IN')}\n`;
        if (getVal('exp_purchase') > 0) expenseSection += `Purchase Things: ₹${getVal('exp_purchase').toLocaleString('en-IN')}\n`;
        if (getVal('exp_damage') > 0) expenseSection += `Damage Recover: ₹${getVal('exp_damage').toLocaleString('en-IN')}\n`;
        if (getVal('exp_development') > 0) expenseSection += `New Development: ₹${getVal('exp_development').toLocaleString('en-IN')}\n`;
        
        if (document.getElementById('showOthers').checked) {
            let hasOthers = false;
            for (let i = 1; i <= otherExpenseCount; i++) {
                const titleEl = document.getElementById(`other_exp_title_${i}`);
                const amountEl = document.getElementById(`other_exp_amount_${i}`);
                if (titleEl && amountEl && amountEl.value > 0) {
                    if (!hasOthers) {
                        expenseSection += 'Other Expenses:\n';
                        hasOthers = true;
                    }
                    expenseSection += `- ${titleEl.value}: ₹${parseFloat(amountEl.value).toLocaleString('en-IN')}\n`;
                }
            }
        }
        
        if (!desc.includes('STATUS:')) {
            expenseSection += '\nSTATUS: UPCOMING\n';
        }
        
        const statusMatch = desc.match(/(STATUS:.+)/);
        if (statusMatch) {
            desc = desc.replace(/(STATUS:.+)/, expenseSection + statusMatch[1]);
        } else {
            desc += expenseSection;
        }
        
        event.description = desc;
        
        await gapi.client.calendar.events.update({
            'calendarId': 'primary',
            'eventId': eventId,
            'resource': event
        });
        
        hideModal('loadingModal');
        closeModal('expenseModal');
        showSuccessAlert("Success", "Expenses updated successfully!");
        
        if (document.getElementById('dashboardSection').style.display !== 'none') {
            fetchBookings();
        }
        
    } catch (error) {
        console.error("Error updating expenses:", error);
        hideModal('loadingModal');
        showAlert("Error", "Could not update expenses.");
    }
}

/* EXCEL EXPORT */
function downloadExcelReport() {
    if (!filteredReportData || filteredReportData.length === 0) {
        showAlert('No Data', 'No data available to export');
        return;
    }
    
    const exportData = filteredReportData.map(item => ({
        'Name': item.name,
        'Marriage Date': item.marriageDateStr,
        'Income (₹)': item.income,
        'Expenses (₹)': item.expenses,
        'Pending (₹)': item.pending,
        'Status': item.status
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    
    const fileName = `Cauvery_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

/* MODAL & NAVIGATION */
function showModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('show');
    }
}

function hideModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('show');
    }
}

function closeModal(id) {
    hideModal(id);
}

function showAlert(title, msg) {
    document.getElementById('alertTitle').innerText = title;
    document.getElementById('alertMsg').innerText = msg;
    
    // Fix alert icon
    const alertBox = document.querySelector('#alertModal .modal-box');
    const existingIcon = alertBox.querySelector('i');
    if (existingIcon) {
        existingIcon.className = 'fas fa-exclamation-circle icon-error';
    }
    
    showModal('alertModal');
}

function showSuccessAlert(title, msg) {
    document.getElementById('alertTitle').innerText = title;
    document.getElementById('alertMsg').innerText = msg;
    
    // Fix success icon
    const alertBox = document.querySelector('#alertModal .modal-box');
    const existingIcon = alertBox.querySelector('i');
    if (existingIcon) {
        existingIcon.className = 'fas fa-check-circle icon-success';
    }
    
    showModal('alertModal');
}

function showDashboard() {
    document.getElementById('bookingSection').style.display = 'none';
    document.getElementById('reportSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    
    document.getElementById('navDashboard').style.display = 'none';
    document.getElementById('navNewBooking').style.display = 'flex';
    
    fetchBookings();
    loadNotifications();
}

function showBookingForm() {
    document.getElementById('bookingSection').style.display = 'block';
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('reportSection').style.display = 'none';
    
    document.getElementById('navDashboard').style.display = 'flex';
    document.getElementById('navNewBooking').style.display = 'none';
    
    document.getElementById('bookingForm').reset();
    
    const idField = document.getElementById('editEventId');
    if (idField) idField.value = '';

    const inputs = document.querySelectorAll('#bookingForm input, #bookingForm select, #bookingForm textarea');
    inputs.forEach(input => input.disabled = false);

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm & Download';
    submitBtn.style.display = 'inline-flex';

    document.getElementById('previewPdfBtn').style.display = 'inline-flex';
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('statusGroup').style.display = 'none';
    document.querySelector('.form-header h3').innerText = "Wedding Hall Booking Form";

    setDefaultDate();
    calculateTotal();
}

/* REPORT - Simplified (add full version from original if needed) */
async function showReportReview() {
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('bookingSection').style.display = 'none';
    document.getElementById('reportSection').style.display = 'block';
    
    await loadReportData();
}
async function loadReportData() {
    if (!gapiInited || !gapi.client.getToken()) {
        showAlert('Error', 'Please sign in first.');
        return;
    }
    showModal('loadingModal');
    
    try {
        const startHistory = new Date('2024-01-01').toISOString();
        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': startHistory, 
            'showDeleted': false,
            'singleEvents': true,
            'maxResults': 1000,
            'orderBy': 'startTime'
        });
        
        const events = response.result.items;
        reportData = [];
        
        events.forEach(event => {
            if (!event.summary || !event.summary.includes('Marriage')) return;
            
            const desc = event.description || "";
            const extract = (label) => {
                // Regex modified to be safer with different line endings
                const regex = new RegExp(`${label}: (.*?)(\\n|$)`);
                const match = desc.match(regex);
                return match ? match[1].trim() : '';
            };
            const cleanAmt = (val) => val ? parseFloat(val.replace(/[₹,]/g, '')) || 0 : 0;
            
            // 1. Extract Values
            const hallTotal = cleanAmt(extract('Total Hall Amount'));
            // Support both new 'Pending Hall Amount' and old 'Pending Amount' labels
            const hallPending = cleanAmt(extract('Pending Hall Amount') || extract('Pending Amount')); 
            
            // Extract Addons (Now available in description)
            const addonsTotal = cleanAmt(extract('Total Addons Amount'));
            const addonsPending = cleanAmt(extract('Pending Addons Amount'));
            
            // 2. Apply User Formulas
            // Income = Total Hall + Total Addons
            const income = hallTotal + addonsTotal;
            
            // Pending = Hall Pending + Addons Pending
            const pending = hallPending + addonsPending;
            
            // Expenses (Existing logic)
            let totalExpenses = 0;
            const expenseMatches = desc.match(/EXPENSES:([\s\S]*?)(?=STATUS:|$)/);
            if (expenseMatches) {
                const expenseLines = expenseMatches[1].match(/₹([\d,]+)/g);
                if (expenseLines) expenseLines.forEach(l => totalExpenses += cleanAmt(l));
            }
            
            // Profit
            const profit = income - totalExpenses; 
            
            // Status
            let status = 'UPCOMING';
            const statusMatch = desc.match(/STATUS: (.+)/);
            if (statusMatch) status = statusMatch[1].trim().toUpperCase();

            reportData.push({
                id: event.id,
                name: event.summary.replace('Marriage - ', ''),
                marriageDate: new Date(event.start.dateTime || event.start.date),
                marriageDateStr: new Date(event.start.dateTime || event.start.date).toLocaleDateString('en-IN'),
                income: income, 
                received: income - pending,
                expenses: totalExpenses,
                profit: profit,
                pending: pending,
                status: status
            });
        });
        
        filteredReportData = [...reportData];
        applyReportFilters(); 
        hideModal('loadingModal');
        
    } catch (error) {
        console.error(error);
        hideModal('loadingModal');
        showAlert('Error', 'Failed to generate report');
    }
}

function renderReportSummary() {
    // Safety check: ensure arrays exist
    const safeReportData = reportData || [];
    const safeFilteredData = filteredReportData || [];

    // A. FILTERED DATA
    const f_income = safeFilteredData.reduce((sum, i) => sum + (Number(i.income) || 0), 0);
    const f_received = safeFilteredData.reduce((sum, i) => sum + (Number(i.received) || 0), 0);
    const f_pending = safeFilteredData.reduce((sum, i) => sum + (Number(i.pending) || 0), 0);
    const f_expenses = safeFilteredData.reduce((sum, i) => sum + (Number(i.expenses) || 0), 0);
    const f_profit = f_received - f_expenses; 
    const f_count = safeFilteredData.length;

    // B. OVERALL DATA
    const o_received = safeReportData.reduce((sum, i) => sum + (Number(i.received) || 0), 0);
    const o_expenses = safeReportData.reduce((sum, i) => sum + (Number(i.expenses) || 0), 0);
    const o_profit = o_received - o_expenses;
    const o_count = safeReportData.length;

    const setText = (id, val) => { const e = document.getElementById(id); if(e) e.innerText = val; };
    
    // USE formatMoney() HERE
    setText('totalFunctions', o_count);
    setText('overallIncome', `₹${formatMoney(o_received)}`);
    setText('overallExpenses', `₹${formatMoney(o_expenses)}`);
    setText('netProfit', `₹${formatMoney(o_profit)}`);

    setText('filteredWeddings', f_count);
    setText('filteredIncome', `₹${formatMoney(f_received)}`);
    setText('filteredExpenses', `₹${formatMoney(f_expenses)}`);
    setText('filteredProfit', `₹${formatMoney(f_profit)}`);
    setText('filteredPending', `₹${formatMoney(f_pending)}`);
}
/* --- HELPER: Safe Money Formatter --- */
function formatMoney(amount) {
    // Convert to number, default to 0 if null/undefined/NaN
    const safeAmount = Number(amount) || 0; 
    return safeAmount.toLocaleString('en-IN');
}
function renderReportTable() {
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';
    
    if (!filteredReportData || filteredReportData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No data matches your filters</td></tr>';
        return;
    }
    
    const start = (reportCurrentPage - 1) * reportRowsPerPage;
    const end = start + reportRowsPerPage;
    const pageData = filteredReportData.slice(start, end);
    
    pageData.forEach(item => {
        const tr = document.createElement('tr');
        const statusColor = getStatusColor(item.status);
        
        // --- DATE FORMATTER ---
        let formattedDate = "N/A";
        if (item.marriageDate) {
            const dateObj = new Date(item.marriageDate);
            if (!isNaN(dateObj)) {
                formattedDate = dateObj.toLocaleDateString('en-GB', { 
                    day: 'numeric', 
                    month: 'short', 
                    year: 'numeric' 
                });
            }
        }
        
        tr.innerHTML = `
            <td><strong>${item.name || 'Unknown'}</strong></td>
            <td>${formattedDate}</td>
            
            <td class="amount-cell" style="color:#00b894">₹${formatMoney(item.income)}</td>
            <td class="amount-cell">₹${formatMoney(item.pending)}</td>
            <td class="amount-cell" style="color:#e74c3c">₹${formatMoney(item.expenses)}</td>
            <td ondblclick="enableInlineStatusEdit(this, '${item.id}', '${item.status}')" style="cursor: pointer;" title="Double click to change status">
                <span class="status-badge" style="background-color: ${statusColor}; padding: 4px 8px; border-radius: 4px; color: white; font-size: 12px;">
                    ${item.status || 'UPCOMING'}
                </span>
            </td>
            
            <td>
                <button class="icon-btn btn-edit" onclick="editBooking('${item.id}')" title="Edit Status & Details" style="width:30px; height:30px;">
                    <i class="fas fa-pen"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    renderReportPagination();
}
/* --- INLINE STATUS EDITING LOGIC --- */

// 1. Convert Cell to Dropdown
function enableInlineStatusEdit(td, eventId, currentStatus) {
    // Prevent re-creating dropdown if already active
    if (td.querySelector('select')) return;

    const options = ['UPCOMING', 'INPROGRESS', 'COMPLETED', 'POSTPONED', 'REJECTED', 'REFUND'];
    
    let selectHtml = `<select class="status-dropdown" 
        onchange="saveInlineStatus('${eventId}', this.value)" 
        onblur="cancelInlineStatusEdit()" 
        style="padding: 6px; border-radius: 4px; border: 2px solid #6c5ce7; font-size: 12px; font-weight: bold;">`;
    
    options.forEach(opt => {
        const selected = opt === currentStatus ? 'selected' : '';
        selectHtml += `<option value="${opt}" ${selected}>${opt}</option>`;
    });
    selectHtml += `</select>`;
    
    td.innerHTML = selectHtml;
    
    // Auto-focus the dropdown so 'onblur' works if they click away
    const select = td.querySelector('select');
    select.focus();
}

// 2. Save Logic (Updates Google Calendar)
async function saveInlineStatus(eventId, newStatus) {
    // Show spinner immediately to indicate processing
    showModal('loadingModal');
    
    try {
        const response = await gapi.client.calendar.events.get({
            'calendarId': 'primary',
            'eventId': eventId
        });
        
        const event = response.result;
        let desc = event.description || "";
        
        // Regex to replace the existing STATUS line
        if (desc.includes('STATUS:')) {
            desc = desc.replace(/STATUS: .*/, `STATUS: ${newStatus}`);
        } else {
            // Append if missing
            desc += `\nSTATUS: ${newStatus}`;
        }
        
        event.description = desc;
        
        // Update Calendar
        await gapi.client.calendar.events.update({
            'calendarId': 'primary',
            'eventId': eventId,
            'resource': event
        });
        
        // Refresh Data to reflect changes
        await loadReportData();
        
        showSuccessAlert('Updated', `Status changed to ${newStatus}`);
        
    } catch (error) {
        console.error("Status Update Error:", error);
        hideModal('loadingModal');
        showAlert('Error', 'Failed to update status.');
        cancelInlineStatusEdit(); // Revert UI
    }
}

// 3. Cancel Logic (Reverts UI on click away)
function cancelInlineStatusEdit() {
    // We simply re-render the table to get back the span
    // Using a small timeout to allow 'onchange' to fire first if a value was selected
    setTimeout(() => {
        // Only re-render if the modal isn't open (meaning no save is in progress)
        if (!document.getElementById('loadingModal').classList.contains('show')) {
            renderReportTable();
        }
    }, 200);
}

function getStatusColor(status) {
    const colors = {
        'COMPLETED': '#27ae60',
        'INPROGRESS': '#f39c12',
        'UPCOMING': '#3498db',
        'POSTPONED': '#95a5a6',
        'REJECTED': '#e74c3c',
        'REFUND': '#9b59b6'
    };
    return colors[status] || '#3498db';
}

function renderReportPagination() {
    const container = document.getElementById('reportPaginationControls');
    container.innerHTML = '';
    
    const totalPages = Math.ceil(filteredReportData.length / reportRowsPerPage);
    if (totalPages <= 1) return;
    
    const createBtn = (text, page, isActive = false, isDisabled = false) => {
        const btn = document.createElement('button');
        btn.className = `page-btn ${isActive ? 'active' : ''}`;
        btn.innerText = text;
        btn.disabled = isDisabled;
        btn.onclick = () => {
            reportCurrentPage = page;
            renderReportTable();
        };
        return btn;
    };
    
    container.appendChild(createBtn('« Prev', reportCurrentPage - 1, false, reportCurrentPage === 1));
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= reportCurrentPage - 1 && i <= reportCurrentPage + 1)) {
            container.appendChild(createBtn(i, i, i === reportCurrentPage));
        } else if (i === reportCurrentPage - 2 || i === reportCurrentPage + 2) {
            const dots = document.createElement('span');
            dots.innerText = '...';
            dots.style.padding = '8px';
            container.appendChild(dots);
        }
    }
    
    container.appendChild(createBtn('Next »', reportCurrentPage + 1, false, reportCurrentPage === totalPages));
}
// 1. Handle Date Dropdown Visibility
function handleDateFilter() {
    // FIX: Correct ID is 'reportDateFilter'
    const filterType = document.getElementById('reportDateFilter').value; 
    const customRange = document.getElementById('customDateRange'); 
    
    if (filterType === 'custom') {
        customRange.style.display = 'flex';
    } else {
        customRange.style.display = 'none';
        applyReportFilters(); // Apply presets (Today, Yesterday, etc.) immediately
    }
}

// 2. Trigger for Custom Range "Apply" Button
function applyCustomDateRange() {
    applyReportFilters();
}
// 3. MASTER FILTER FUNCTION (Handles both Date AND Status)
function applyReportFilters() {
    // FIX: Use Correct IDs from your HTML
    const dateType = document.getElementById('reportDateFilter').value;
    const statusType = document.getElementById('reportStatusFilter').value;
    
    let fromDate = null;
    let toDate = null;
    
    // Set 'today' to the beginning of the day (00:00:00)
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // A. Determine Date Range
    switch(dateType) {
        case 'today':
            fromDate = new Date(today);
            toDate = new Date(today);
            toDate.setHours(23,59,59,999); // End of today
            break;
            
        case 'yesterday':
            fromDate = new Date(today);
            fromDate.setDate(today.getDate() - 1); // Go back 1 day
            toDate = new Date(fromDate);
            toDate.setHours(23,59,59,999); // End of yesterday
            break;
            
        case 'lastWeek':
            fromDate = new Date(today);
            fromDate.setDate(today.getDate() - 7); // Go back 7 days
            toDate = new Date(today);
            toDate.setHours(23,59,59,999);
            break;
            
        case 'lastMonth':
            fromDate = new Date(today);
            fromDate.setMonth(today.getMonth() - 1); // Go back 1 month
            toDate = new Date(today);
            toDate.setHours(23,59,59,999);
            break;
            
        case 'lastYear':
            fromDate = new Date(today);
            fromDate.setFullYear(today.getFullYear() - 1); // Go back 1 year
            toDate = new Date(today);
            toDate.setHours(23,59,59,999);
            break;
            
        case 'custom':
            // FIX: Use Correct IDs 'reportFromDate' & 'reportToDate'
            const f = document.getElementById('reportFromDate').value;
            const t = document.getElementById('reportToDate').value;
            if(f) fromDate = new Date(f);
            if(t) { 
                toDate = new Date(t); 
                toDate.setHours(23,59,59,999); // Include the entire end day
            }
            break;
            
        case 'all':
        default:
            // No date filtering
            fromDate = null;
            toDate = null;
            break;
    }
    
    // B. Filter the Data
    filteredReportData = reportData.filter(item => {
        // 1. Check Date (if range exists)
        if (fromDate && item.marriageDate < fromDate) return false;
        if (toDate && item.marriageDate > toDate) return false;
        
        // 2. Check Status
        if (statusType !== 'ALL' && item.status !== statusType) return false;
        
        return true;
    });
    
    // C. Re-render UI
    reportCurrentPage = 1;
    renderReportSummary(); // Update Top Cards
    renderReportTable();   // Update Table
    renderCharts();        // Update Charts
}
// 2. Apply Date Logic
function applyDateFilter() {
    const filterType = document.getElementById('reportDateFilter').value;
    let fromDate, toDate;
    const today = new Date();
    today.setHours(0,0,0,0);
    applyReportFilters();
    // Reset Data
    filteredReportData = [...reportData];

    if (filterType === 'custom') {
        const fromVal = document.getElementById('reportFromDate').value;
        const toVal = document.getElementById('reportToDate').value;
        if(fromVal) fromDate = new Date(fromVal);
        if(toVal) {
            toDate = new Date(toVal);
            toDate.setHours(23,59,59);
        }
    } else {
        // Presets
        switch(filterType) {
            case 'today':
                fromDate = new Date(today);
                toDate = new Date(today);
                toDate.setHours(23,59,59);
                break;
            case 'yesterday':
                fromDate = new Date(today);
                fromDate.setDate(today.getDate() - 1);
                toDate = new Date(fromDate);
                toDate.setHours(23,59,59);
                break;
            case 'lastWeek':
                fromDate = new Date(today);
                fromDate.setDate(today.getDate() - 7);
                break;
            case 'lastMonth':
                fromDate = new Date(today);
                fromDate.setMonth(today.getMonth() - 1);
                break;
            case 'lastYear':
                fromDate = new Date(today);
                fromDate.setFullYear(today.getFullYear() - 1);
                break;
            case 'all':
            default:
                fromDate = null;
        }
    }

    // Apply Filter
    if (fromDate || toDate) {
        filteredReportData = filteredReportData.filter(item => {
            if (fromDate && item.marriageDate < fromDate) return false;
            if (toDate && item.marriageDate > toDate) return false;
            return true;
        });
    }

    // Re-apply Status Filter if specific status is selected
    const currentStatus = document.getElementById('reportStatusFilter').value;
    if (currentStatus !== 'ALL') {
        filteredReportData = filteredReportData.filter(item => item.status === currentStatus);
    }

    // Render Views
    reportCurrentPage = 1;
    renderReportSummary();
    renderReportTable();
    renderCharts();
}
function applyStatusFilter() {
    const status = document.getElementById('reportStatusFilter').value;
    
    if (status === 'ALL') {
        filteredReportData = [...reportData];
    } else {
        filteredReportData = reportData.filter(item => item.status === status);
    }
    
    reportCurrentPage = 1;
    renderReportSummary();
    renderReportTable();
    renderCharts();
    applyReportFilters();
    applyDateFilter();
}

function renderCharts() {
    // Destroy existing charts to prevent "Canvas is already in use" errors
    if (barChartInstance) barChartInstance.destroy();
    if (pieChartInstance) pieChartInstance.destroy();
    if (doughnutChartInstance) doughnutChartInstance.destroy();
    if (lineChartInstance) lineChartInstance.destroy();

    // Render all charts
    renderBarChart();      // Income vs Expense Bar
    renderPieChart();      // Status Distribution
    renderDoughnutChart(); // Expense vs Profit Ratio
    renderLineChart();     // Monthly Growth Trend
}
/* --- DOUGHNUT CHART: Expense vs Profit (Where the money goes) --- */
function renderDoughnutChart() {
    const ctx = document.getElementById('doughnutChart');
    if (!ctx) return;

    // Calculate Totals
    const totalIncome = filteredReportData.reduce((sum, item) => sum + item.income, 0);
    const totalExpenses = filteredReportData.reduce((sum, item) => sum + item.expenses, 0);
    const totalProfit = totalIncome - totalExpenses;

    // If no data, show empty
    if (totalIncome === 0) return;

    doughnutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Expenses (Spend)', 'Net Profit (Save)'],
            datasets: [{
                data: [totalExpenses, totalProfit],
                backgroundColor: [
                    'rgba(231, 76, 60, 0.7)', // Red for Expenses
                    'rgba(46, 204, 113, 0.7)' // Green for Profit
                ],
                borderColor: [
                    'rgba(231, 76, 60, 1)',
                    'rgba(46, 204, 113, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = ((value / totalIncome) * 100).toFixed(1);
                            return `${context.label}: ₹${value.toLocaleString('en-IN')} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/* --- LINE CHART: Monthly Growth (Income Trends) --- */
function renderLineChart() {
    const ctx = document.getElementById('lineChart');
    if (!ctx) return;

    // 1. Group Data by Month (YYYY-MM) to sort correctly
    const monthlyStats = {};

    filteredReportData.forEach(item => {
        // Create a sortable key like "2024-02"
        const date = new Date(item.marriageDate);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const label = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

        if (!monthlyStats[key]) {
            monthlyStats[key] = { label: label, income: 0, expenses: 0 };
        }
        monthlyStats[key].income += item.income;
        monthlyStats[key].expenses += item.expenses;
    });

    // 2. Sort keys chronologically
    const sortedKeys = Object.keys(monthlyStats).sort();

    // 3. Extract data arrays
    const labels = sortedKeys.map(key => monthlyStats[key].label);
    const incomeData = sortedKeys.map(key => monthlyStats[key].income);
    const expenseData = sortedKeys.map(key => monthlyStats[key].expenses);

    lineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Income',
                    data: incomeData,
                    borderColor: '#00b894', // Green
                    backgroundColor: 'rgba(0, 184, 148, 0.1)',
                    tension: 0.4, // Smooth curves
                    fill: true
                },
                {
                    label: 'Expenses',
                    data: expenseData,
                    borderColor: '#e74c3c', // Red
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    },
                    ticks: {
                        callback: function(value) {
                            return '₹' + formatMoney(value);
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}
function renderBarChart() {
    const ctx = document.getElementById('barChart');
    if (!ctx) return;
    
    if (barChartInstance) barChartInstance.destroy();
    
    const monthlyData = {};
    filteredReportData.forEach(item => {
        const month = item.marriageDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        if (!monthlyData[month]) {
            monthlyData[month] = { income: 0, expenses: 0 };
        }
        monthlyData[month].income += item.income;
        monthlyData[month].expenses += item.expenses;
    });
    
    const labels = Object.keys(monthlyData).slice(-6);
    const incomeData = labels.map(month => monthlyData[month].income);
    const expenseData = labels.map(month => monthlyData[month].expenses);
    
    barChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Income',
                    data: incomeData,
                    backgroundColor: 'rgba(46, 204, 113, 0.6)',
                    borderColor: 'rgba(46, 204, 113, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Expenses',
                    data: expenseData,
                    backgroundColor: 'rgba(231, 76, 60, 0.6)',
                    borderColor: 'rgba(231, 76, 60, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '₹' + formatMoney(value);
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ₹' + formatMoney(context.parsed.y);
                        }
                    }
                }
            }
        }
    });
}

/* OPTIONAL: Replace existing renderPieChart to show Payment Status */
function renderPieChart() {
    const ctx = document.getElementById('pieChart');
    if (!ctx) return;
    if (pieChartInstance) pieChartInstance.destroy();

    // Calculate Total Advance vs Total Pending
    const totalAdvance = filteredReportData.reduce((sum, item) => sum + (item.income - item.pending), 0); // Approx received
    const totalPending = filteredReportData.reduce((sum, item) => sum + item.pending, 0);

    pieChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Received (Cash in Hand)', 'Pending (To Collect)'],
            datasets: [{
                data: [totalAdvance, totalPending],
                backgroundColor: ['#0984e3', '#fdcb6e'], // Blue & Orange
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            const total = totalAdvance + totalPending;
                            const pct = ((val/total)*100).toFixed(1);
                            return ` ₹${val.toLocaleString('en-IN')} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}
/* CLOSE MODALS ON OUTSIDE CLICK */
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
}

/* PREVENT ENTER ON FORM */
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.type !== 'textarea') {
        e.preventDefault();
    }
});

console.log('✅ Cauvery Wedding Hall - Complete System Loaded');
console.log('✅ All Features: Notifications, WhatsApp, Dashboard, CRUD, Excel Export');
console.log('✅ Local Storage: Session persists on refresh');
