/* ==================================================
   CONFIGURATION
   ================================================== */
// ⚠️ REPLACE WITH YOUR REAL CREDENTIALS
const CLIENT_ID = '194658348326-6it21orc6nnhaj17s0a2536t5c8lt9v6.apps.googleusercontent.com'; 
const API_KEY = 'AIzaSyCfQU6b59gao-oypLobWMXhb4SSD5XpHVQ';

const DISCOVERY_DOCS = [
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
];
// Add 'drive.file' to allow uploading
const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file';

/* ==================================================
   STATE & INITIALIZATION
   ================================================== */
let tokenClient;
let gapiInited = false;
let gisInited = false;
let userEmail = '';
let bookingData = {};
/* ==================================================
   STATE MANAGEMENT
   ================================================== */
let allBookings = [];      // Stores ALL data fetched from Google
let filteredBookings = []; // Stores data after search
let currentPage = 1;
let rowsPerPage = 10;

document.addEventListener('DOMContentLoaded', () => {
    setDefaultDate();
    setupListeners();
    checkGoogleLibraryStatus();
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
    // Live Calculation on Input Change
    const calcIds = [
        'totalHallAmount', 'advanceAmount', 
        'cleaningFee', 'cleaningFeeAmount', 
        'acRooms', 'acRoomsAmount', 
        'serialLights', 'serialLightsAmount',
        'speaker', 'speakerAmount', 
        'sapaduIlai', 'sapaduIlaiAmount', 
        'others', 'otherAmount'
    ];
    
    calcIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', calculateTotal);
    });

    // Toggle Others
    document.getElementById('others').addEventListener('change', function() {
        const othersFields = document.getElementById('othersFields');
        othersFields.style.display = this.checked ? 'flex' : 'none';
        if(!this.checked) {
            document.getElementById('otherTitle').value = '';
            document.getElementById('otherAmount').value = '0';
        }
        calculateTotal();
    });

    // Real-time validation listeners
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

    // Form Submit
    document.getElementById('bookingForm').addEventListener('submit', handleFormSubmit);

    // Preview PDF Button
    document.getElementById('previewPdfBtn').addEventListener('click', handlePreviewPDF);

    // Auth Button
    document.getElementById('googleSignInBtn').addEventListener('click', handleAuthClick);
}

/* ==================================================
   VALIDATION FUNCTIONS
   ================================================== */
function showError(inputId, errorId, message) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    input.classList.add('invalid');
    input.classList.remove('valid');
    error.textContent = message;
    error.classList.add('show');
}

function hideError(inputId, errorId) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    input.classList.remove('invalid');
    input.classList.add('valid');
    error.classList.remove('show');
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
    validateAdvanceAmount(); // Re-validate advance
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

    if (selectedDate < today) {
        showError('marriageDate', 'marriageDateError', 'Marriage date cannot be in the past');
        return false;
    }

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

    // Allow same date but different times
    if (to < from) {
        showError('toDateTime', 'toDateTimeError', 'End time must be after start time');
        return false;
    }

    // Check if dates are too far apart (more than 7 days)
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

    // Check required fields
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

/* ==================================================
   LOGIC & CALCULATIONS
   ================================================== */
function calculateTotal() {
    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;
    const isChecked = (id) => document.getElementById(id).checked;

    const totalHall = getVal('totalHallAmount');
    const advance = getVal('advanceAmount');
    const pending = Math.max(0, totalHall - advance);

    document.getElementById('pendingAmount').value = pending;

    let extras = 0;
    if(isChecked('cleaningFee')) extras += getVal('cleaningFeeAmount');
    if(isChecked('acRooms')) extras += getVal('acRoomsAmount');
    if(isChecked('serialLights')) extras += getVal('serialLightsAmount');
    if(isChecked('speaker')) extras += getVal('speakerAmount');
    if(isChecked('sapaduIlai')) extras += getVal('sapaduIlaiAmount');
    if(isChecked('others')) extras += getVal('otherAmount');

    const finalTotal = pending + extras;
    document.getElementById('displayFinal').innerText = `₹ ${finalTotal.toLocaleString('en-IN')}`;

    // Update Global State
    bookingData = {
        totalHall, 
        advance, 
        pending, 
        finalTotal,
        fees: {
            cleaning: isChecked('cleaningFee') ? getVal('cleaningFeeAmount') : 0,
            ac: isChecked('acRooms') ? getVal('acRoomsAmount') : 0,
            lights: isChecked('serialLights') ? getVal('serialLightsAmount') : 0,
            speaker: isChecked('speaker') ? getVal('speakerAmount') : 0,
            ilai: isChecked('sapaduIlai') ? getVal('sapaduIlaiAmount') : 0,
            other: isChecked('others') ? getVal('otherAmount') : 0,
            otherTitle: isChecked('others') ? document.getElementById('otherTitle').value : ''
        }
    };
}

/* ==================================================
   GOOGLE AUTH & CALENDAR
   ================================================== */
function gapiLoaded() {
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: DISCOVERY_DOCS,
            });
            gapiInited = true;
        } catch (error) {
            console.error('Error initializing Google API:', error);
        }
    });
}

function gisLoaded() {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '', // defined dynamically
        });
        gisInited = true;
    } catch (error) {
        console.error('Error initializing Google Identity Services:', error);
    }
}

function checkGoogleLibraryStatus() {
    const btn = document.getElementById('googleSignInBtn');
    const loader = document.getElementById('btnLoader');
    const txt = document.getElementById('btnText');

    const timer = setInterval(() => {
        if (gapiInited && gisInited) {
            btn.classList.remove('disabled');
            btn.removeAttribute('disabled');
            loader.classList.remove('fa-spinner', 'fa-spin');
            loader.classList.add('fa-google');
            txt.innerText = "Sign in with Google";
            clearInterval(timer);
        }
    }, 500);

    // Timeout after 10 seconds
    setTimeout(() => {
        if (!gapiInited || !gisInited) {
            clearInterval(timer);
            loader.classList.remove('fa-spinner', 'fa-spin');
            loader.classList.add('fa-exclamation-triangle');
            txt.innerText = "Calendar Unavailable (Optional)";
            btn.classList.remove('disabled');
            btn.removeAttribute('disabled');
        }
    }, 10000);
}

function handleAuthClick() {
    if(!gapiInited || !gisInited) {
        showAlert('Calendar Setup', 'Google Calendar integration is optional. You can still download the PDF without it.');
        return;
    }

    tokenClient.callback = async (resp) => {
        if (resp.error) {
            console.error('Auth error:', resp);
            showAlert('Authentication Failed', 'Could not connect to Google Calendar. You can still use the booking system.');
            return;
        }
        
        try {
            // Fetch user email
            const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${resp.access_token}` }
            }).then(res => res.json());
            console.log(userInfo);
            userEmail = userInfo.email;
            const btn = document.getElementById('googleSignInBtn');
            btn.classList.add('success');
            document.getElementById('btnText').innerText = `${userEmail}`;
            document.getElementById('btnLoader').classList.replace('fa-google','fab fa-google');
            showAlert('Sucess', 'user logged in sucessfully.');
        } catch (error) {
            console.error('Error fetching user info:', error);
            showAlert('Error', 'Could not retrieve user information.');
        }
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

/* ==================================================
   SUBMIT HANDLER
   ================================================== */
async function handlePreviewPDF() {
    // Validate all fields first
    if (!validateAllFields()) {
        showAlert('Validation Error', 'Please fix all errors before previewing.');
        const firstError = document.querySelector('.invalid');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    try {
        // Populate PDF data
        populatePDFTemplate();

        // Show a simple visual preview in modal instead
        const previewContent = document.getElementById('pdf-template').cloneNode(true);
        previewContent.style.position = 'static';
        previewContent.style.visibility = 'visible';
        previewContent.style.left = 'auto';
        previewContent.style.transform = 'scale(0.8)';
        previewContent.style.transformOrigin = 'top center';
        
        const previewFrame = document.getElementById('pdfPreviewFrame');
        previewFrame.style.display = 'none'; // Hide iframe
        
        // Create preview container
        const previewContainer = document.createElement('div');
        previewContainer.id = 'preview-container';
        previewContainer.style.cssText = 'overflow: auto; background: #f5f5f5; padding: 20px; border-radius: 8px;';
        previewContainer.appendChild(previewContent);
        
        // Clear and add preview
        const previewBody = document.querySelector('.preview-body');
        previewBody.innerHTML = '';
        previewBody.appendChild(previewContainer);
        
        showModal('pdfPreviewModal');

    } catch (error) {
        console.error('Preview error:', error);
        showAlert('Preview Error', 'Could not generate preview. Please try downloading directly.');
    }
}
let finalPdfLink = "";
async function handleFormSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('editEventId') ? document.getElementById('editEventId').value : null;

    // Validate all fields
    if (!validateAllFields()) {
        showAlert('Validation Error', 'Please fix all errors before submitting.');
        const firstError = document.querySelector('.invalid');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    // Show Loading
    showModal('loadingModal');

    try {
        // Add to Calendar (if logged in)
        if (userEmail && gapiInited) {
            try {
                // await addToCalendar();
                if (editId) {
                    // UPDATE EXISTING EVENT
                    console.log("Updating Event ID:", editId);
                    await updateCalendarEvent(editId);
                    showAlert("Success", "Booking Updated Successfully!");
                    hideModal('loadingModal');
                    showAlert("Success", "Booking details updated successfully.");
                    showDashboard();
                    return;
                } else {
                    await addToCalendar();
                }
            } catch (calError) {
                console.error('Calendar error:', calError);
                // Continue even if calendar fails
            }
        }

        // Generate PDF
        const pdfData = await generatePDF();
        
        // 2. Upload to Drive (if logged in)
        if (gapiInited && gapi.client.getToken()) {
            console.log("Uploading to Drive...");
            finalPdfLink = await uploadToDrive(pdfData.blob, pdfData.fileName);
            console.log("Link Generated:", finalPdfLink);
        }

        // Success
        hideModal('loadingModal');
        showModal('successModal');

        // Reset form after success
        setTimeout(() => {
            document.getElementById('bookingForm').reset();
            setDefaultDate();
            calculateTotal();
        }, 2000);

    } catch (err) {
        console.error('Submission error:', err);
        hideModal('loadingModal');
        showAlert('Error', 'Something went wrong: ' + err.message);
    }
}

async function addToCalendar() {
    console.log("Attempting to add to calendar...");
    if (!tokenClient || !gapi.client.calendar) {
        throw new Error("Google Calendar API is not loaded or user is not signed in.");
    }
    const getTxt = (id) => document.getElementById(id).value;
    const name = getTxt('marriagePersonName');
    const mobile = getTxt('mobileNumber');
    const city = getTxt('customerFrom');
    const givenBy = getTxt('amountGivenBy');
    
    // Build comprehensive description with ALL booking details
    const servicesText = [];
    if (bookingData.fees.cleaning > 0) servicesText.push(`Cleaning: ₹${bookingData.fees.cleaning.toLocaleString('en-IN')}`);
    if (bookingData.fees.ac > 0) servicesText.push(`AC Rooms: ₹${bookingData.fees.ac.toLocaleString('en-IN')}`);
    if (bookingData.fees.lights > 0) servicesText.push(`Serial Lights: ₹${bookingData.fees.lights.toLocaleString('en-IN')}`);
    if (bookingData.fees.speaker > 0) servicesText.push(`Speaker: ₹${bookingData.fees.speaker.toLocaleString('en-IN')}`);
    if (bookingData.fees.ilai > 0) servicesText.push(`Sapadu Ilai: ₹${bookingData.fees.ilai.toLocaleString('en-IN')}`);
    if (bookingData.fees.other > 0) servicesText.push(`${bookingData.fees.otherTitle || 'Other'}: ₹${bookingData.fees.other.toLocaleString('en-IN')}`);

    const desc = `
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
Total Hall Amount: ₹${bookingData.totalHall.toLocaleString('en-IN')}
Advance Paid: ₹${bookingData.advance.toLocaleString('en-IN')}
Pending Amount: ₹${bookingData.pending.toLocaleString('en-IN')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 ADDITIONAL SERVICES:
${servicesText.length > 0 ? servicesText.join('\n') : 'No additional services selected'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧾 FINAL TOTAL AMOUNT: ₹${bookingData.finalTotal.toLocaleString('en-IN')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 IMPORTANT NOTES:
⚡ Electricity Bill Extra: ₹30 / Unit
💧 Can water available at low cost
⚠️  No Generator facility
📞 Contact: +91 99446 45441

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

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
                {'method': 'email', 'minutes': 24 * 60}, // 1 day before
                {'method': 'popup', 'minutes': 60} // 1 hour before
            ]
        }
    };

    await gapi.client.calendar.events.insert({
        'calendarId': 'primary',
        'resource': event
    });
}

async function updateCalendarEvent(eventId) {
    // This reuses the logic from addToCalendar but sends 'update' instead of 'insert'
    const getTxt = (id) => document.getElementById(id).value;
    const name = getTxt('marriagePersonName');
    const mobile = getTxt('mobileNumber');
    const city = getTxt('customerFrom');
    const givenBy = getTxt('amountGivenBy');
    
    // Build comprehensive description with ALL booking details
    const servicesText = [];
    if (bookingData.fees.cleaning > 0) servicesText.push(`Cleaning: ₹${bookingData.fees.cleaning.toLocaleString('en-IN')}`);
    if (bookingData.fees.ac > 0) servicesText.push(`AC Rooms: ₹${bookingData.fees.ac.toLocaleString('en-IN')}`);
    if (bookingData.fees.lights > 0) servicesText.push(`Serial Lights: ₹${bookingData.fees.lights.toLocaleString('en-IN')}`);
    if (bookingData.fees.speaker > 0) servicesText.push(`Speaker: ₹${bookingData.fees.speaker.toLocaleString('en-IN')}`);
    if (bookingData.fees.ilai > 0) servicesText.push(`Sapadu Ilai: ₹${bookingData.fees.ilai.toLocaleString('en-IN')}`);
    if (bookingData.fees.other > 0) servicesText.push(`${bookingData.fees.otherTitle || 'Other'}: ₹${bookingData.fees.other.toLocaleString('en-IN')}`);

    const desc = `
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
Total Hall Amount: ₹${bookingData.totalHall.toLocaleString('en-IN')}
Advance Paid: ₹${bookingData.advance.toLocaleString('en-IN')}
Pending Amount: ₹${bookingData.pending.toLocaleString('en-IN')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 ADDITIONAL SERVICES:
${servicesText.length > 0 ? servicesText.join('\n') : 'No additional services selected'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧾 FINAL TOTAL AMOUNT: ₹${bookingData.finalTotal.toLocaleString('en-IN')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 IMPORTANT NOTES:
⚡ Electricity Bill Extra: ₹30 / Unit
💧 Can water available at low cost
⚠️  No Generator facility
📞 Contact: +91 99446 45441

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

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
                {'method': 'email', 'minutes': 24 * 60}, // 1 day before
                {'method': 'popup', 'minutes': 60} // 1 hour before
            ]
        }
    };

    await gapi.client.calendar.events.update({
        'calendarId': 'primary',
        'eventId': eventId,
        'resource': event
    });
}

/* ==================================================
   FETCH & PROCESS DATA
   ================================================== */
async function fetchBookings() {
    const tbody = document.getElementById('bookingsTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading bookings...</td></tr>';

    try {
        // Fetch MORE results (maxResults: 250) so we can paginate locally
        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': (new Date()).toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'maxResults': 250, 
            'orderBy': 'startTime'
        });

        const events = response.result.items;
        
        // Filter and Map Data immediately
        allBookings = events
            .filter(e => e.summary && e.summary.includes('Marriage'))
            .map(event => {
                // Parse once and store
                const start = new Date(event.start.dateTime || event.start.date);
                const desc = event.description || "";
                const mobileMatch = desc.match(/Mobile Number: (\d+)/);
                const cityMatch = desc.match(/Customer City: (.*)/);

                return {
                    id: event.id,
                    dateObj: start, // For sorting
                    dateStr: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                    timeStr: start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                    name: event.summary.replace('Marriage - ', ''),
                    mobile: mobileMatch ? mobileMatch[1] : 'N/A',
                    city: cityMatch ? cityMatch[1].trim() : 'N/A',
                    fullEvent: event // Store original for Edit/View
                };
            });

        // Initial Render
        filteredBookings = [...allBookings]; // Copy all to filtered
        currentPage = 1;
        renderTable();

    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color:red">Error loading data.</td></tr>';
    }
}
/* ==================================================
   SEARCH & PAGINATION LOGIC
   ================================================== */
function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    
    filteredBookings = allBookings.filter(booking => 
        booking.name.toLowerCase().includes(term) || 
        booking.mobile.includes(term) ||
        booking.city.toLowerCase().includes(term)
    );

    currentPage = 1; // Reset to page 1 on search
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

    // Calculate Slice
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredBookings.slice(start, end);

    // Generate Rows
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
                    <button class="icon-btn btn-download" onclick="downloadBookingPdf('${booking.id}')" title="Download">
                        <i class="fas fa-file-pdf"></i>
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
    if (totalPages <= 1) return; // Don't show if only 1 page

    // Helper to create button
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

    // Prev Button
    container.appendChild(createBtn('« Prev', currentPage - 1, false, currentPage === 1));

    // Page Numbers (Simple version: Show all if < 7, otherwise intelligent truncate)
    // For simplicity, let's show formatted 1, 2 ... Last
    for (let i = 1; i <= totalPages; i++) {
        // Show first, last, current, and neighbors
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

    // Next Button
    container.appendChild(createBtn('Next »', currentPage + 1, false, currentPage === totalPages));
}
let currentEvent = null; // Store current event object

async function getEventById(id) {
    const response = await gapi.client.calendar.events.get({
        'calendarId': 'primary',
        'eventId': id
    });
    return response.result;
}

/* ==================================================
   DASHBOARD ACTIONS (View, Edit, Download)
   ================================================== */

// 1. VIEW: Fills the form but disables editing
async function viewBooking(eventId) {
    // Reuse edit logic to fill data
    await editBooking(eventId);

    // Lock all inputs
    const inputs = document.querySelectorAll('#bookingForm input, #bookingForm button');
    inputs.forEach(input => {
        // Don't disable the "Close/Cancel" button
        if(input.id !== 'cancelEditBtn') {
            input.disabled = true;
        }
    });

    // Change UI text
    document.querySelector('.form-header h3').innerText = "View Booking Details";
    const cancelBtn = document.getElementById('cancelEditBtn');
    cancelBtn.innerText = "Close View";
    cancelBtn.disabled = false; // Ensure close button works
    
    // Hide Submit/Preview buttons in View mode
    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('previewPdfBtn').style.display = 'none';
}

// 2. EDIT: Fills the form and allows changes
async function editBooking(eventId) {
    showModal('loadingModal');
    
    try {
        // Fetch event from Google
        const response = await gapi.client.calendar.events.get({
            'calendarId': 'primary',
            'eventId': eventId
        });
        const event = response.result;

        // Switch to Form View
        showBookingForm();

        // Store ID so we know we are updating
        const idField = document.getElementById('editEventId');
        if (idField) idField.value = eventId;

        // --- POPULATE FORM FIELDS ---
        // Helper to extract text from description
        const desc = event.description || "";
        const extract = (label) => {
            const regex = new RegExp(`${label}: (.*)`);
            const match = desc.match(regex);
            return match ? match[1].trim() : '';
        };

        // Helper to clean currency (remove ₹ and ,)
        const cleanAmt = (val) => {
            if (!val) return 0;
            return parseFloat(val.replace(/[₹,]/g, '')) || 0;
        };

        // Fill Basic Info
        document.getElementById('marriagePersonName').value = event.summary.replace('Marriage - ', '');
        document.getElementById('mobileNumber').value = extract('Mobile Number') || '';
        document.getElementById('customerFrom').value = extract('Customer City') || '';
        document.getElementById('amountGivenBy').value = extract('Booked By') || '';

        // Fill Dates (Convert ISO to Input format)
        if(event.start && event.start.dateTime) {
            const start = new Date(event.start.dateTime);
            const end = new Date(event.end.dateTime);
            // Adjust for timezone offset to show correctly in input
            start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
            end.setMinutes(end.getMinutes() - end.getTimezoneOffset());
            
            document.getElementById('fromDateTime').value = start.toISOString().slice(0,16);
            document.getElementById('toDateTime').value = end.toISOString().slice(0,16);
            document.getElementById('marriageDate').value = start.toISOString().split('T')[0];
        }

        // Fill Money
        document.getElementById('totalHallAmount').value = cleanAmt(extract('Total Hall Amount'));
        document.getElementById('advanceAmount').value = cleanAmt(extract('Advance Paid'));

        // Recalculate Pending & Total
        calculateTotal();

        // UI Updates
        document.querySelector('.form-header h3').innerText = "Edit Booking";
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Booking';
        submitBtn.classList.add('warning-btn'); // Optional styling
        
        const cancelBtn = document.getElementById('cancelEditBtn');
        cancelBtn.style.display = 'inline-block';
        cancelBtn.innerText = "Cancel Edit";
        
        hideModal('loadingModal');

    } catch (error) {
        console.error("Edit Error:", error);
        hideModal('loadingModal');
        showAlert("Error", "Could not load booking details.");
        showDashboard(); // Go back on error
    }
}

// 3. DOWNLOAD: Temporarily fills form to generate PDF, then resets
async function downloadBookingPdf(eventId) {
    // 1. Fill the form with data (in background)
    await editBooking(eventId);
    
    // 2. Generate PDF
    // We use a small timeout to ensure DOM is updated
    setTimeout(async () => {
        try {
            await generatePDF();
            // 3. Return to Dashboard after download
            cancelEdit(); 
            showDashboard();
        } catch (e) {
            console.error(e);
        }
    }, 500);
}

// 4. CANCEL: Resets everything back to normal
function cancelEdit() {
    // 1. Reset Form
    document.getElementById('bookingForm').reset();
    
    // 2. Clear Hidden ID (Safety Check)
    const idField = document.getElementById('editEventId');
    if (idField) idField.value = '';

    // 3. Re-enable inputs (in case we were in View mode)
    const inputs = document.querySelectorAll('#bookingForm input, #bookingForm button');
    inputs.forEach(input => input.disabled = false);

    // 4. Reset UI Buttons
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> Confirm & Download';
    submitBtn.style.display = 'inline-flex'; // Make sure it's visible
    submitBtn.classList.remove('warning-btn');

    document.getElementById('previewPdfBtn').style.display = 'inline-flex';
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.querySelector('.form-header h3').innerText = "Wedding Hall Booking Form";

    // 5. Reset Defaults
    setDefaultDate();
    calculateTotal();
    showDashboard();
}

async function deleteBooking(eventId) {
    // 1. Ask for confirmation
    const isConfirmed = confirm("⚠️ Are you sure you want to DELETE this booking?\n\nThis action cannot be undone.");

    if (isConfirmed) {
        showModal('loadingModal');
        try {
            // 2. Delete from Google Calendar
            await gapi.client.calendar.events.delete({
                'calendarId': 'primary',
                'eventId': eventId
            });

            // 3. Refresh Table
            await fetchBookings();
            
            hideModal('loadingModal');
            showAlert("Deleted", "Booking has been permanently deleted.");
            
        } catch (error) {
            console.error("Delete Error:", error);
            hideModal('loadingModal');
            showAlert("Error", "Failed to delete booking.");
        }
    }
}

function populatePDFTemplate() {
    const getTxt = (id) => document.getElementById(id).value;
    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    // Format dates
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
    setTxt('pdf_pending', bookingData.pending.toLocaleString('en-IN'));
    setTxt('pdf_final', bookingData.finalTotal.toLocaleString('en-IN'));

    setTxt('pdf_givenBy', getTxt('amountGivenBy'));
    setTxt('pdf_city', getTxt('customerFrom'));
    setTxt('pdf_mobile', getTxt('mobileNumber'));

    // Services
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
    if(bookingData.fees.other > 0) {
        addService(`✨ ${bookingData.fees.otherTitle || 'Other'}`, bookingData.fees.other);
    }

    if (list.innerHTML === '') {
        list.innerHTML = '<p style="color: #999; font-style: italic; margin: 0;">No additional services selected</p>';
    }
}

function generatePDF() {
    return new Promise((resolve, reject) => {
        try {
            const getTxt = (id) => document.getElementById(id).value;
            
            // Populate PDF data
            populatePDFTemplate();

            // Generate PDF with optimized settings
            const element = document.getElementById('pdf-template');
            const fileName = `Cauvery_Booking_${document.getElementById('marriagePersonName').value}.pdf`;
            const opt = {
                margin: [10, 10, 10, 10],
                filename: `Cauvery_Wedding_Booking_${getTxt('marriagePersonName').replace(/\s+/g, '_')}.pdf`,
                image: { 
                    type: 'jpeg', 
                    quality: 1 
                },
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

            // html2pdf()
            //     .set(opt)
            //     .from(element)
            //     .save()
            //     .then(() => {
            //         resolve();
            //     })
            //     .catch(err => {
            //         console.error('PDF generation error:', err);
            //         reject(err);
            //     });
            html2pdf().set(opt).from(element).output('blob').then((blob) => {
            // 1. Download it locally for you
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                
                // 2. Return the blob and filename for Drive Upload
                resolve({ blob, fileName });
            })

        } catch (error) {
            console.error('PDF preparation error:', error);
            reject(error);
        }
    });
}
async function uploadToDrive(pdfBlob, fileName) {
    try {
        // 1. Metadata
        const metadata = {
            'name': fileName,
            'mimeType': 'application/pdf'
        };

        // 2. Prepare Multipart Upload
        const accessToken = gapi.client.getToken().access_token;
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', pdfBlob);

        // 3. Upload Request
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: form
        });
        
        // --- SAFETY CHECK START ---
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Drive Upload Failed: ${errorText}`);
        }
        // --- SAFETY CHECK END ---

        const file = await response.json();
        console.log("File Uploaded:", file);

        // 4. Make Public (Only if file exists)
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
        // Don't crash the whole app, just return null so the user gets the PDF but no link
        return null; 
    }
}
function openWhatsApp() {
    // 1. Get Data
    const mobile = document.getElementById('mobileNumber').value;
    const name = document.getElementById('marriagePersonName').value;
    const date = document.getElementById('marriageDate').value;
    mobile = '91' + mobile;
    
    // Format Date for message
    const dateObj = new Date(date);
    const dateStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    // 2. Build the Message (Use %0a for new lines)
    // We use encodeURIComponent to ensure special characters don't break the link
    let message = `*CAUVERY WEDDING HALL - BOOKING CONFIRMATION* %0a`;
    message += `--------------------------------%0a`;
    message += `📅 *Date:* ${dateStr}%0a`;
    message += `👤 *Name:* ${name}%0a`;
    message += `💰 *Total Amount:* ₹${bookingData.totalHall.toLocaleString('en-IN')}%0a`;
    message += `💵 *Advance Paid:* ₹${bookingData.advance.toLocaleString('en-IN')}%0a`;
    message += `❗ *Pending Amount:* ₹${bookingData.pending.toLocaleString('en-IN')}%0a`;
    message += `--------------------------------%0a`;
    message += `Thank you for booking with us! Please find the official receipt attached below. 👇`;
    if (finalPdfLink) {
        message += `\n📄 *Download Receipt:* ${finalPdfLink}`;
    }

    // 3. Open WhatsApp
    // '91' is added for India country code
    const encodedMessage = encodeURIComponent(message);

    // 4. Open WhatsApp
    const url = `https://wa.me/${mobile}?text=${encodedMessage}`;
    window.open(url, '_blank');
}

/* ==================================================
   MODAL UTILS
   ================================================== */
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

function showAlert(title, msg) {
    document.getElementById('alertTitle').innerText = title;
    document.getElementById('alertMsg').innerText = msg;
    showModal('alertModal');
}

function closeModal(id) {
    hideModal(id);
}
function showDashboard() {
    document.getElementById('bookingSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    document.getElementById('navDashboard').style.display = 'none';
    document.getElementById('navNewBooking').style.display = 'flex'; // Show "New Booking" button
    fetchBookings(); // Load data
}

function showBookingForm() {
    document.getElementById('bookingSection').style.display = 'block';
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('navDashboard').style.display = 'flex'; // Show "Dashboard" button
    document.getElementById('navNewBooking').style.display = 'none';
    
    // Reset form for new entry
    cancelEdit();
}

// Close modal on outside click
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
}

// Prevent form submission on enter (except on submit button)
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
    }
});
