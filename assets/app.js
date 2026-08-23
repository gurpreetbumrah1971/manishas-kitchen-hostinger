const CART_KEY = 'phpCart';
const CART_EXPIRES_AT_KEY = 'phpCartExpiresAt';
const CART_TTL_MS = 30 * 60 * 1000;
const ORDER_SESSION_KEY = 'mkOrderSession';
const CUSTOMER_AUTH_KEY = 'mkCustomerAuth';
const CASHBACK_REDEEM_KEY = 'mkCashbackRedeem';
const CASHBACK_OTP_KEY = 'mkCashbackOtp';
const CASHBACK_WALLET_MODE_KEY = 'mkCashbackWalletMode';
// Build URLs relative to this project's folder. This supports both a
// Hostinger document root and local XAMPP projects whose directory has a name.
const APP_BASE_URL = document.currentScript && document.currentScript.src
  ? new URL('../', document.currentScript.src).toString()
  : new URL('./', window.location.href).toString();
const API_BASE_URL = new URL('api', APP_BASE_URL).toString().replace(/\/$/, '');
// MSG91 requires tokenAuth in the browser for its OTP widget. Fetch it at
// runtime so deployment credentials are never stored in the public build.
let msg91OtpConfigPromise;
let msg91WidgetPromise;
let msg91RequestId = '';

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function msg91OtpConfig() {
  if (!msg91OtpConfigPromise) {
    msg91OtpConfigPromise = fetch(apiUrl('/customer/otp-config'), { headers: { Accept: 'application/json' } })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok || !data.widgetId || !data.tokenAuth) {
          throw new Error(data.error || 'MSG91 OTP is not configured.');
        }
        return data;
      });
  }
  return msg91OtpConfigPromise;
}

function pageUrl(path) {
  return new URL(String(path).replace(/^\//, ''), APP_BASE_URL).toString();
}

function msg91RequestIdentifier(data) {
  // The widget's sendOtp success response carries the session request id in
  // `message` (a short hex string), and some builds expose it as `reqId` etc.
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (!data || typeof data !== 'object') return '';
  if (Array.isArray(data)) return data.map(msg91RequestIdentifier).find(Boolean) || '';
  const direct = data.reqId || data.req_id || data.requestId || data.request_id || data.reqID;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (typeof data.message === 'string' && data.message.trim()
    && !/\s/.test(data.message) && data.message.trim().length < 64) return data.message.trim();
  return Object.values(data)
    .filter((value) => value && typeof value === 'object')
    .map((value) => msg91RequestIdentifier(value))
    .find(Boolean) || '';
}

function msg91ErrorMessage(error) {
  const message = String(error?.message || error || '').trim();
  if (/authentication\s*failure|authenticationfailure/i.test(message)) {
    return 'MSG91 rejected the OTP Widget token. Generate a new token for this Widget ID in MSG91, then update MSG91_TOKEN_AUTH and try again.';
  }
  return message || 'MSG91 could not send the OTP.';
}

function waitForMsg91Methods() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 10000;
    const check = () => {
      if (typeof window.sendOtp === 'function' && typeof window.verifyOtp === 'function') {
        resolve();
      } else if (Date.now() >= deadline) {
        reject(new Error('MSG91 OTP service did not initialise. Please refresh and try again.'));
      } else {
        window.setTimeout(check, 100);
      }
    };
    check();
  });
}

function loadMsg91Widget() {
  if (typeof window.sendOtp === 'function' && typeof window.verifyOtp === 'function') return Promise.resolve();
  if (msg91WidgetPromise) return msg91WidgetPromise;

  msg91WidgetPromise = new Promise((resolve, reject) => {
    const sources = [
      'https://verify.msg91.com/otp-provider.js',
      'https://verify.phone91.com/otp-provider.js',
    ];
    let sourceIndex = 0;

    const initialise = async () => {
      if (typeof window.initSendOTP !== 'function') {
        throw new Error('MSG91 OTP service did not initialise.');
      }
      const otpConfig = await msg91OtpConfig();
      const widgetOptions = {
        widgetId: otpConfig.widgetId,
        tokenAuth: otpConfig.tokenAuth,
        exposeMethods: true,
        success: () => {},
        failure: () => {},
      };
      // Do not send an empty optional CAPTCHA render target to MSG91.
      if (otpConfig.captchaRenderId) widgetOptions.captchaRenderId = otpConfig.captchaRenderId;
      window.initSendOTP(widgetOptions);
      await waitForMsg91Methods();
    };

    const loadNextSource = () => {
      const source = sources[sourceIndex++];
      if (!source) {
        reject(new Error('Could not load MSG91 OTP service. Please check your internet connection and try again.'));
        return;
      }
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.onload = () => {
        initialise().then(resolve).catch((error) => {
          // A loaded script which does not expose MSG91's widget cannot be
          // recovered by trying another host, so keep its useful error.
          reject(error);
        });
      };
      script.onerror = loadNextSource;
      document.head.appendChild(script);
    };

    loadNextSource();
  });
  // A rejected promise is otherwise retained for the rest of the page, which
  // prevents a customer from retrying after a transient network failure.
  msg91WidgetPromise.catch(() => { msg91WidgetPromise = undefined; });
  return msg91WidgetPromise;
}

// Sends the OTP via the MSG91 widget and returns the request id for that
// session. The server verifies the OTP against the same session, so no access
// token needs to be extracted or verified in the browser.
async function sendMsg91Otp(mobileNumber) {
  await loadMsg91Widget();
  msg91RequestId = '';
  return new Promise((resolve, reject) => {
    window.sendOtp(mobileNumber, (data) => {
      const requestId = msg91RequestIdentifier(data);
      if (!requestId) {
        reject(new Error('MSG91 did not return an OTP session. Please request a new OTP.'));
        return;
      }
      msg91RequestId = requestId;
      resolve(requestId);
    }, (error) => reject(new Error(msg91ErrorMessage(error))));
  });
}
const CASHBACK_NUMBER_KEY = 'mkCashbackNumber';
const CASHBACK_NAME_KEY = 'mkCashbackName';
const CASHBACK_REFERRAL_KEY = 'mkReferralCode';
const INDEPENDENCE_BANNER_SEEN_KEY = 'mkIndependenceBannerSeenV4';
const APP_ASSET_BASE_URL = document.currentScript && document.currentScript.src
  ? new URL('.', document.currentScript.src).toString()
  : new URL('assets/', APP_BASE_URL).toString();
const projectAssetUrl = (url) => {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return url.startsWith('/assets/')
    ? new URL(url.slice(1), APP_BASE_URL).toString()
    : url;
};
const INDEPENDENCE_BANNER_URL = new URL('banners/independence-month-banner.png', APP_ASSET_BASE_URL).toString();
const DISCOUNT_TIERS = {
  400: 0.10,
  800: 0.15,
  1000: 0.20,
};
const FRONTEND_CATEGORY_ORDER = ['Parathas', 'Frankies', 'Kebabs', 'Pakodas', 'Egg Dishes', 'Snacks', 'Beverages'];
const FRONTEND_CATEGORY_INDEX = new Map(FRONTEND_CATEGORY_ORDER.map((name, index) => [name, index]));
const ADDITIONAL_STATIC_CATEGORIES = [
  { name: 'Kebabs', slug: 'kebabs' },
];
const ADDITIONAL_STATIC_MENU_ITEMS = [
  { id: 69, name: 'Chicken Frankie', description: 'Soft roll filled with spiced chicken and onions.', price: 139, categoryName: 'Frankies', isVeg: false, image: '/assets/food/photo-updates/chicken-frankie.png' },
  { id: 70, name: 'Moong Dal Pakoda', description: 'Crisp moong dal fritters with house masala.', price: 69, categoryName: 'Pakodas', isVeg: true, image: '/assets/food/photo-updates/moong-dal-pakoda.png' },
  { id: 71, name: 'Chana Daal Pakoda', description: 'Crisp chana dal fritters with house masala.', price: 69, categoryName: 'Pakodas', isVeg: true, image: '/assets/food/photo-updates/chana-dal-pakoda.png' },
  { id: 72, name: 'Palak Pakoda', description: 'Crisp spinach fritters with house masala.', price: 69, categoryName: 'Pakodas', isVeg: true, image: '/assets/food/photo-updates/palak-paratha.png' },
  { id: 73, name: 'Paneer Pakoda', description: 'Crisp paneer fritters with house masala.', price: 109, categoryName: 'Pakodas', isVeg: true, image: '/assets/food/optimized/generated/paneer-paratha-realistic.jpg' },
  { id: 74, name: 'Idli', description: 'Steamed rice cakes served with chutney.', price: 49, categoryName: 'Snacks', isVeg: true, image: '/assets/food/optimized/generated/uttapam-realistic.jpg' },
  { id: 63, name: 'Mulli Paratha', description: 'Wheat flatbread stuffed with seasoned radish.', price: 69, categoryName: 'Parathas', isVeg: true, image: '/assets/food/photo-updates/muli-paratha.png' },
  { id: 64, name: 'Chicken Kheema Paratha', description: 'Wheat flatbread stuffed with spiced chicken kheema.', price: 129, categoryName: 'Parathas', isVeg: false, image: '/assets/food/photo-updates/chicken-kheema-paratha.png' },
  { id: 65, name: 'Corn Cheese Paratha', description: 'Wheat flatbread stuffed with sweet corn and cheese.', price: 109, categoryName: 'Parathas', isVeg: true, image: '/assets/food/photo-updates/corn-cheese-paratha.png' },
  { id: 66, name: 'Loki Paratha', description: 'Wheat flatbread stuffed with seasoned vegetables.', price: 69, categoryName: 'Parathas', isVeg: true, image: '/assets/food/photo-updates/loki-paratha.png' },
  { id: 67, name: 'Chicken Galouti Kebab', description: 'Tender minced chicken kebab with aromatic spices.', price: 199, categoryName: 'Kebabs', isVeg: false, image: '/assets/food/photo-updates/chicken-kheema-paratha.png' },
  { id: 68, name: 'Chicken Shami Kebab', description: 'Spiced chicken and lentil kebab cooked until tender.', price: 199, categoryName: 'Kebabs', isVeg: false, image: '/assets/food/photo-updates/chicken-kheema-paratha.png' },
];
ADDITIONAL_STATIC_MENU_ITEMS.forEach((item) => {
  item.image = projectAssetUrl(item.image);
});
const STATIC_MENU_ITEM_OVERRIDES = new Map([
  ['Tea', { price: 29 }],
  ['Hot Coffee', { price: 39 }],
  ['Chaas', { price: 29 }],
  ['Nimbu Pani', { price: 29 }],
  ['Lemon Tea', { price: 39 }],
  ['Green Tea', { price: 39 }],
  ['Iced Tea', { price: 69 }],
  ['Chocolate Milkshake', { price: 99 }],
  ['Cold Coffee', { price: 79 }],
  ['Egg Burji + 2 Pav (Single)', { name: 'Single Egg Burjee + 2 Butter Pav', price: 79, isVeg: false }],
  ['Egg Burji + 2 Pav (Double)', { name: 'Double Egg Burjee + 4 Butter Pav', price: 139, isVeg: false }],
  ['Egg Omelet + 2 Pav (Single)', { name: 'Single Egg Omelet + 2 Butter Pav', price: 79, isVeg: false }],
  ['Egg Omelet + 2 Pav (Double)', { name: 'Double Omelet + 4 Butter Pav', price: 139, isVeg: false }],
  ['Aloo Frankie', { price: 79 }],
  ['Paneer Frankie', { price: 139 }],
  ['Wada Pav', { price: 29 }],
  ['Wada', { price: 29 }],
  ['Onion Pakoda', { price: 69 }],
  ['Aloo Paratha', { price: 69 }],
  ['Gobi Paratha', { price: 69 }],
  ['Paneer Paratha', { price: 109 }],
  ['Methi Paratha', { price: 69 }],
  ['Palak Paratha', { price: 69 }],
  ['Cabbage Paratha', { price: 69 }],
  ['Moong Daal Chilla', { price: 69 }],
  ['Plain Paratha', { price: 29 }],
  ['Poha', { price: 49 }],
  ['Upma', { price: 49 }],
  ['Uttapam', { price: 69 }],
  ['Chole Puri', { remove: true }],
  ['Chole Bhature', { remove: true }],
  ['Chole Plate', { remove: true }],
  ['Pav Bhaji', { remove: true }],
  ['Pav', { remove: true }],
  ['Mix Pakoda', { remove: true }],
  ['Misal Pav', { remove: true }],
  ['Wada Usal Pav', { remove: true }],
  ['Chikoo Milkshake', { remove: true }],
  ['Watermelon Juice', { remove: true }],
  ['Mango Milkshake', { remove: true }],
]);

let cartExpiryTimer;

function clearCartStorage() {
  localStorage.removeItem(CART_KEY);
  localStorage.removeItem(CART_EXPIRES_AT_KEY);
  if (cartExpiryTimer) window.clearTimeout(cartExpiryTimer);
}

function scheduleCartExpiry() {
  if (cartExpiryTimer) window.clearTimeout(cartExpiryTimer);
  const expiresAt = Number(localStorage.getItem(CART_EXPIRES_AT_KEY));
  const delay = expiresAt - Date.now();
  if (!Number.isFinite(expiresAt) || delay <= 0) return;
  cartExpiryTimer = window.setTimeout(() => {
    getCart();
    renderCartControls();
    renderCheckout();
    updateCartCount();
  }, delay);
}

function getCart() {
  try {
    const storedCart = localStorage.getItem(CART_KEY);
    if (!storedCart) return [];
    const expiresAt = Number(localStorage.getItem(CART_EXPIRES_AT_KEY));
    // Carts created before this expiry policy have no deadline, so they are
    // treated as expired instead of reappearing indefinitely.
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      clearCartStorage();
      return [];
    }
    scheduleCartExpiry();
    return JSON.parse(storedCart)
      .map(applyCartItemOverride)
      .filter(Boolean);
  } catch {
    clearCartStorage();
    return [];
  }
}

function saveCart(cart) {
  if (!cart.length) {
    clearCartStorage();
  } else {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    localStorage.setItem(CART_EXPIRES_AT_KEY, String(Date.now() + CART_TTL_MS));
    scheduleCartExpiry();
  }
  renderCartControls();
  renderCheckout();
  updateCartCount();
}

function money(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

function rupeeCompact(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
}

function istDate(value) {
  if (!value) return null;
  const source = String(value);
  // MySQL timestamps do not include an offset. They are stored and served in IST.
  const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(source)
    ? `${source.replace(' ', 'T')}+05:30`
    : source;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIstTime(value) {
  const date = istDate(value);
  return date ? new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date) : '';
}

function formatIstDateTime(value) {
  const date = istDate(value);
  return date ? new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date) : '';
}

function upiPaymentConfig() {
  const root = document.querySelector('[data-upi-payment]');
  return {
    upiId: ((root && root.dataset.upiId) || 'manishaskitchen2026@okaxis').trim(),
  };
}

function buildUpiUrl() {
  const { upiId } = upiPaymentConfig();
  if (!upiId) return '#';
  return `upi://pay?pa=${upiId}`;
}

function isIOSBrowser() {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function upiProviderLinks() {
  const { upiId } = upiPaymentConfig();
  const pa = encodeURIComponent(upiId);
  return [
    { label: 'Google Pay', href: `tez://upi/pay?pa=${pa}` },
    { label: 'PhonePe', href: `phonepe://pay?pa=${pa}` },
    { label: 'Paytm', href: `paytmmp://pay?pa=${pa}` },
    { label: 'BHIM / Other UPI', href: `upi://pay?pa=${pa}` },
  ];
}

function upiProviderButtons() {
  // iOS has no OS-level chooser for a bare upi:// link like Android does -
  // it just hands off to whichever single app has registered that scheme
  // (usually WhatsApp), so list each UPI app's own scheme as separate buttons.
  const payMarkup = isIOSBrowser()
    ? `
      <div class="upi-provider-grid">
        ${upiProviderLinks().map((provider) => `
          <a class="btn secondary upi-provider" href="${escapeHtml(provider.href)}" data-upi-link>${escapeHtml(provider.label)}</a>
        `).join('')}
      </div>
    `
    : `<a class="btn primary full upi-pay-btn" href="${escapeHtml(buildUpiUrl())}" data-upi-link>Pay</a>`;
  return `
    ${payMarkup}
    <div class="upi-qr-card">
      <p class="upi-qr-label">Or scan to pay with any UPI app</p>
      <img class="upi-qr-image" src="${projectAssetUrl('/assets/upi-qr.jpg')}" alt="Manisha's Kitchen UPI payment QR code" width="180" height="180">
      <a class="btn secondary upi-qr-download" href="${projectAssetUrl('/assets/upi-qr.jpg')}" download="manishas-kitchen-upi-qr.jpg">Download QR code</a>
    </div>
  `;
}

function parseMoney(value) {
  // Values are formatted like "Rs. 3.45" - stripping non-digit/non-dot chars
  // alone would leave the dot from "Rs." too (".3.45"), which Number() can't
  // parse. Match the numeric run itself instead.
  const match = String(value || '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function getActiveOrderSession() {
  try {
    const session = JSON.parse(localStorage.getItem(ORDER_SESSION_KEY) || 'null');
    if (!session || !session.orderNumber || !session.token || !session.expiresAt) return null;
    if (Date.now() >= new Date(session.expiresAt).getTime()) {
      localStorage.removeItem(ORDER_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(ORDER_SESSION_KEY);
    return null;
  }
}

function saveOrderSession(session) {
  localStorage.setItem(ORDER_SESSION_KEY, JSON.stringify(session));
}

function normalizeMobileNumber(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

function getCustomerAuth() {
  try {
    const auth = JSON.parse(localStorage.getItem(CUSTOMER_AUTH_KEY) || 'null');
    if (!auth || !auth.token || !auth.customer || !auth.expiresAt) return null;
    if (Date.now() >= new Date(auth.expiresAt).getTime()) {
      localStorage.removeItem(CUSTOMER_AUTH_KEY);
      return null;
    }
    return auth;
  } catch {
    localStorage.removeItem(CUSTOMER_AUTH_KEY);
    return null;
  }
}

function saveCustomerAuth(auth) {
  localStorage.setItem(CUSTOMER_AUTH_KEY, JSON.stringify(auth));
}

function savedAddressesForCustomer() {
  const auth = getCustomerAuth();
  return auth && auth.customer && Array.isArray(auth.customer.savedAddresses) ? auth.customer.savedAddresses : [];
}

function savedAddressCardsHtml(addresses, selectable = false) {
  if (!addresses.length) return '<p class="cashback-empty">No saved addresses yet.</p>';
  return `<div class="saved-address-list">${addresses.map((savedAddress) => `
    <article class="saved-address-card">
      <div><strong>${escapeHtml(savedAddress.label)}</strong><p>${escapeHtml(savedAddress.address)}</p></div>
      ${selectable ? `<button class="btn secondary" type="button" data-saved-address-select="${Number(savedAddress.id)}">Use this address</button>` : `<button class="btn ghost" type="button" data-saved-address-delete="${Number(savedAddress.id)}">Remove</button>`}
    </article>
  `).join('')}</div>`;
}

function renderSavedAddressPicker() {
  const picker = document.querySelector('[data-saved-address-picker]');
  if (!picker) return;
  const addresses = savedAddressesForCustomer();
  picker.hidden = !addresses.length;
  picker.innerHTML = addresses.length ? `<strong>Saved locations</strong>${savedAddressCardsHtml(addresses, true)}` : '';
}

function renderAccount(account) {
  const target = document.querySelector('[data-account-content]');
  if (!target) return;
  if (!account) {
    const pending = getPendingCashbackOtp();
    target.innerHTML = `
      <section class="card account-login-card">
        <div class="account-heading"><span class="account-avatar">&#128100;</span><span><h2>Login to your account</h2><p>Use your mobile number and one-time password to view orders and cashback.</p></span></div>
        <form class="cashback-login-form" data-account-login-form>
          <label>Mobile Number<input name="mobile_number" required inputmode="tel" placeholder="10-digit mobile number"></label>
          <button class="btn primary" type="submit">Send OTP</button>
        </form>
        ${pending ? `<form class="cashback-login-form" data-account-verify-form><input type="hidden" name="mobile_number" value="${escapeHtml(pending.mobileNumber)}">${pending.testOtp ? `<p class="cashback-test-otp">Local testing OTP: <strong>${escapeHtml(pending.testOtp)}</strong></p>` : `<p class="cashback-test-otp">${pending.provider === 'msg91' ? 'OTP sent on WhatsApp. Check your messages.' : 'OTP sent. Check your phone.'}</p>`}<label>Enter OTP<input name="otp" required inputmode="numeric" maxlength="4" placeholder="4-digit OTP"></label><button class="btn primary" type="submit">Login</button></form>` : ''}
      </section>`;
    return;
  }
  const customer = account.customer || {};
  const orders = account.orders || [];
  target.innerHTML = `
    <div class="account-grid">
      <section class="card wallet-summary-card">
        <div class="account-heading"><span class="account-avatar">&#128100;</span><span><h2>${escapeHtml(customer.name || 'Welcome back')}</h2><p>${escapeHtml(customer.mobileNumber || '')}</p></span></div>
        <div class="wallet-balance"><small>Cashback wallet balance</small><strong>${money(customer.cashbackBalance)}</strong><span>Available to redeem on your next order</span></div>
        <a class="btn primary" href="${pageUrl('checkout.html')}">Redeem on next order</a>
        <button class="btn ghost" type="button" data-account-logout>Logout</button>
      </section>
      <section class="card account-history-card"><div class="account-section-title"><h2>Order History</h2><span>${orders.length} order${orders.length === 1 ? '' : 's'}</span></div>${orders.length ? `<div class="order-history-list">${orders.map((order) => `<article class="order-history-row"><div><strong>${escapeHtml(order.orderNumber)}</strong><small>${escapeHtml(formatIstDateTime(order.createdAt))} IST · ${escapeHtml(order.status)}</small><p>${escapeHtml((order.items || []).map((item) => `${item.quantity} x ${item.name}`).join(', '))}</p></div><div class="order-history-total"><strong>${money(order.grandTotal)}</strong><small>${order.cashbackEarned > 0 ? `+${money(order.cashbackEarned)} cashback` : 'No cashback'}</small></div></article>`).join('')}</div>` : '<p class="cashback-empty">No orders found for this mobile number yet.</p>'}</section>
      <section class="card account-history-card"><div class="account-section-title"><h2>Saved Addresses</h2><span>${(customer.savedAddresses || []).length} saved</span></div>${savedAddressCardsHtml(customer.savedAddresses || [])}</section>
      <section class="card account-history-card"><div class="account-section-title"><h2>Special Days</h2><span>Birthday</span></div><form class="special-day-save-form" data-special-day-save-form>${specialDayFieldsHtml(customer)}</form></section>
      <section class="card account-history-card"><div class="account-section-title"><h2>Cashback Activity</h2><span>Latest credits and redemptions</span></div>${cashbackTransactionHtml(account.transactions || [])}</section>
    </div>`;
  document.querySelector('[data-account-content]').querySelectorAll('[data-date-group]').forEach(bindDateGroup);
}

async function loadCustomerAccount() {
  const target = document.querySelector('[data-account-content]');
  if (!target) return;
  const auth = getCustomerAuth();
  if (!auth) {
    renderAccount(null);
    return;
  }
  try {
    const response = await fetch(apiUrl('/customer/account'), { headers: { Accept: 'application/json', Authorization: `Bearer ${auth.token}` } });
    if (!response.ok) throw new Error('Session expired');
    const account = await response.json();
    saveCustomerAuth({ token: auth.token, expiresAt: auth.expiresAt, customer: account.customer, transactions: account.transactions || [] });
    renderAccount(account);
  } catch {
    localStorage.removeItem(CUSTOMER_AUTH_KEY);
    renderAccount(null);
  }
}

function getPendingCashbackOtp() {
  try {
    const pending = JSON.parse(localStorage.getItem(CASHBACK_OTP_KEY) || 'null');
    if (!pending || !pending.mobileNumber || !pending.expiresAt) return null;
    if (Date.now() >= new Date(pending.expiresAt).getTime()) {
      localStorage.removeItem(CASHBACK_OTP_KEY);
      return null;
    }
    return pending;
  } catch {
    localStorage.removeItem(CASHBACK_OTP_KEY);
    return null;
  }
}

function customerCashbackBalance() {
  const auth = getCustomerAuth();
  return auth && auth.customer ? Number(auth.customer.cashbackBalance || 0) : 0;
}

function requestedCashbackRedeem() {
  return Math.max(0, Number(localStorage.getItem(CASHBACK_REDEEM_KEY) || 0) || 0);
}

function cashbackAppliedFor(preCashbackTotal) {
  const auth = getCustomerAuth();
  if (!auth) return 0;
  return Math.max(0, Math.min(requestedCashbackRedeem(), customerCashbackBalance(), Number(preCashbackTotal || 0)));
}

function appliedReferralCode() {
  return (localStorage.getItem(CASHBACK_REFERRAL_KEY) || '').trim().toUpperCase();
}

function referralDiscountForSubtotal(subtotal) {
  return appliedReferralCode() ? Math.round(Number(subtotal || 0) * 0.05 * 100) / 100 : 0;
}

function studentDiscountDetails() {
  const selected = Boolean((document.querySelector('[data-student-discount-toggle]') || {}).checked);
  const institution = String((document.querySelector('[data-student-institution]') || {}).value || '').trim();
  const grade = String((document.querySelector('[data-student-grade]') || {}).value || '').trim();
  return { institution, grade, eligible: selected && Boolean(institution && grade) };
}

function studentDiscountForSubtotal(subtotal) {
  return studentDiscountDetails().eligible
    ? Math.round(Number(subtotal || 0) * 0.10 * 100) / 100
    : 0;
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    // ignore copy failures
  }
  document.body.removeChild(textarea);
}

function renderReferralState() {
  const input = document.querySelector('[data-referral-code]');
  const status = document.querySelector('[data-referral-status]');
  const applyBtn = document.querySelector('[data-referral-apply]');
  if (!input) return;
  const code = appliedReferralCode();
  if (code) {
    input.value = code;
    if (applyBtn) applyBtn.textContent = 'Remove';
    if (status) {
      status.textContent = '5% referral discount applied to this order.';
      status.classList.add('ok');
      status.classList.remove('error');
    }
  } else {
    if (applyBtn) applyBtn.textContent = 'Apply';
  }
}

function cashbackTransactionHtml(transactions) {
  if (!transactions || !transactions.length) {
    return '<p class="cashback-empty">No cashback available? Go ahead and order from our tasty menu, save some money with discounts and get cashback of 10% of your final bill amount in your wallet. Use it to save more next time.</p>';
  }
  return `
    <div class="cashback-transactions">
      ${transactions.slice(0, 5).map((transaction) => {
        const isRedeemed = transaction.type === 'REDEEMED';
        const prefix = isRedeemed ? '-' : '+';
        return `
          <div class="cashback-transaction">
            <span>
              <strong>${escapeHtml(transaction.note || transaction.type)}</strong>
              <small>${escapeHtml(formatIstDateTime(transaction.createdAt))} IST</small>
            </span>
            <b class="${isRedeemed ? 'cashback-debit' : 'cashback-credit'}">${prefix}${money(transaction.amount)}</b>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderCashbackPanel(preCashbackTotal = 0, applied = 0) {
  const panel = document.querySelector('[data-cashback-panel]');
  if (!panel) return;

  const auth = getCustomerAuth();
  const pendingOtp = getPendingCashbackOtp();

  if (!auth) {
    const mode = panel.dataset.walletMode || localStorage.getItem(CASHBACK_WALLET_MODE_KEY) || 'existing';
    const syncedNumber = (localStorage.getItem(CASHBACK_NUMBER_KEY) || '').trim();
    panel.dataset.walletMode = mode;
    try {
      localStorage.setItem(CASHBACK_WALLET_MODE_KEY, mode);
    } catch {
      // ignore storage errors
    }
    panel.innerHTML = `
      <h2>Cashback Wallet</h2>
      <p>${mode === 'new' ? 'Create a wallet profile to earn cashback on this order.' : 'Login to view your cashback and redeem it on this order.'}</p>
      <div class="wallet-mode-toggle" role="group" aria-label="Wallet login type">
        <button type="button" class="${mode === 'existing' ? 'active' : ''}" data-wallet-mode-btn="existing">Existing User</button>
        <button type="button" class="${mode === 'new' ? 'active' : ''}" data-wallet-mode-btn="new">New User</button>
      </div>
      <form class="cashback-login-form" data-cashback-login-form>
        <label>Mobile Number<input name="mobile_number" data-wallet-number required inputmode="tel" placeholder="10-digit mobile number" value="${escapeHtml(syncedNumber)}"></label>
        ${mode === 'new' ? `<label>Your Name<input name="customer_name" required autocomplete="name" placeholder="Enter your name" value="${escapeHtml((localStorage.getItem(CASHBACK_NAME_KEY) || '').trim())}"></label>` : ''}
        <button class="btn secondary full" type="submit">Send OTP</button>
      </form>
      ${pendingOtp ? `
        <form class="cashback-login-form" data-cashback-verify-form>
          <input type="hidden" name="mobile_number" value="${escapeHtml(pendingOtp.mobileNumber)}">
          ${pendingOtp.testOtp ? `<p class="cashback-test-otp">Testing OTP: <strong>${escapeHtml(pendingOtp.testOtp)}</strong></p>` : `<p class="cashback-test-otp">${pendingOtp.provider === 'msg91' ? 'OTP sent on WhatsApp. Check your messages.' : 'OTP sent. Check your phone.'}</p>`}
          <label>Enter OTP<input name="otp" required inputmode="numeric" maxlength="4" placeholder="4-digit OTP"></label>
          <button class="btn primary full" type="submit">Verify &amp; Login</button>
        </form>
      ` : ''}
    `;
    return;
  }

  const customer = auth.customer || {};
  const balance = Number(customer.cashbackBalance || 0);
  const maxRedeem = Math.max(0, Math.min(balance, Number(preCashbackTotal || 0)));
  const savedRedeem = Math.max(0, Math.min(requestedCashbackRedeem(), maxRedeem));
  if (savedRedeem !== requestedCashbackRedeem()) {
    localStorage.setItem(CASHBACK_REDEEM_KEY, String(savedRedeem));
  }

  const redeemBlock = savedRedeem > 0
    ? `
      <div class="cashback-redeem-applied">
        <span>Redeemed on this order: <strong>${money(savedRedeem)}</strong></span>
        <button class="btn ghost" type="button" data-cashback-redeem-remove>Remove</button>
      </div>`
    : maxRedeem > 0
      ? `
      <div class="cashback-redeem-cta">
        <button class="btn primary full" type="button" data-cashback-redeem-all data-amount="${maxRedeem.toFixed(2)}">Redeem ${money(maxRedeem)} on this order</button>
      </div>`
      : '<p class="cashback-help">No cashback to redeem on this order.</p>';

  panel.innerHTML = `
    <h2>Cashback Wallet</h2>
    <div class="cashback-balance-row">
      <span>
        <small>Logged in as ${escapeHtml(customer.mobileNumber || '')}</small>
        <strong>${money(balance)}</strong>
      </span>
      <button class="btn ghost" type="button" data-cashback-logout>Logout</button>
    </div>
    ${redeemBlock}
    <p class="cashback-help">Cashback in wallet: ${money(balance)}.</p>
  `;
}

async function refreshCustomerWallet() {
  const auth = getCustomerAuth();
  if (!auth) {
    renderCashbackPanel();
    return null;
  }

  const response = await fetch(apiUrl('/customer/wallet'), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
  });
  if (!response.ok) {
    localStorage.removeItem(CUSTOMER_AUTH_KEY);
    renderCheckout();
    return null;
  }
  const wallet = await response.json();
  const nextAuth = {
    token: auth.token,
    expiresAt: auth.expiresAt,
    customer: wallet.customer,
    transactions: wallet.transactions || [],
  };
  saveCustomerAuth(nextAuth);
  renderCheckout();
  return nextAuth;
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updateCartCount() {
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  document.querySelectorAll('[data-cart-count]').forEach((node) => {
    node.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
  });
  document.querySelectorAll('[data-cart-total]').forEach((node) => {
    node.textContent = money(subtotal);
  });
  document.querySelectorAll('[data-floating-cart]').forEach((node) => {
    node.hidden = count <= 0;
  });
  document.body.classList.toggle('cart-active', count > 0);
  updateDiscountNudge(subtotal);
}

function applyCartItemOverride(item) {
  const override = STATIC_MENU_ITEM_OVERRIDES.get(item && item.name);
  if (!override) return item;
  if (override.remove) return null;
  return {
    ...item,
    name: override.name || item.name,
    price: override.price || item.price,
  };
}

function updateStaticMenuItemOverrides() {
  document.querySelectorAll('[data-menu-item]').forEach((card) => {
    const heading = card.querySelector('.menu-heading h3');
    const originalName = categoryNameFromNode(heading);
    const override = STATIC_MENU_ITEM_OVERRIDES.get(originalName);
    if (!override) return;

    if (override.remove) {
      card.remove();
      return;
    }

    const name = override.name || originalName;
    const description = categoryNameFromNode(card.querySelector('.menu-body p'));
    const isVeg = override.isVeg != null ? override.isVeg : card.dataset.veg !== 'nonveg';
    const price = Number(override.price || 0);
    if (heading) heading.textContent = name;
    const priceNode = card.querySelector('.menu-heading strong');
    if (priceNode) priceNode.textContent = money(price);
    card.dataset.name = `${name} ${description}`.toLowerCase();
    card.dataset.veg = isVeg ? 'veg' : 'nonveg';

    const control = card.querySelector('[data-cart-control]');
    if (!control) return;
    const currentItem = control.dataset.cartItem ? JSON.parse(control.dataset.cartItem) : {};
    const nextItem = {
      ...currentItem,
      name,
      price,
    };
    const encodedItem = JSON.stringify(nextItem);
    control.dataset.cartItem = encodedItem;
    control.querySelectorAll('[data-add-cart]').forEach((button) => {
      button.dataset.item = encodedItem;
    });
  });
}

function isFrankie(name) {
  return /Frankie$/i.test(name || '');
}

function isCheeseAddonEligible(name) {
  return isFrankie(name) || /Paratha$/i.test(name || '') || name === 'Moong Daal Chilla';
}

function cheeseAddonHtml() {
  return '<label class="cheese-addon"><input type="checkbox" data-cheese-addon><span>Add Cheese</span><strong>+Rs. 19.00</strong></label>';
}

function syncCheeseAddon(card, restoreSelection = false) {
  const control = card.querySelector('[data-cart-control]');
  const checkbox = card.querySelector('[data-cheese-addon]');
  if (!control || !checkbox) return;

  if (!control.dataset.baseCartItem) control.dataset.baseCartItem = control.dataset.cartItem || '{}';
  const baseItem = JSON.parse(control.dataset.baseCartItem);
  const addonId = Number(baseItem.id) + 10000;
  if (restoreSelection) checkbox.checked = getCart().some((item) => Number(item.id) === addonId);

  const item = checkbox.checked
    ? { ...baseItem, id: addonId, name: `${baseItem.name} + Cheese`, price: Number(baseItem.price) + 19 }
    : baseItem;
  const encodedItem = JSON.stringify(item);
  control.dataset.id = String(item.id);
  control.dataset.cartItem = encodedItem;
  control.querySelectorAll('[data-add-cart]').forEach((button) => {
    button.dataset.item = encodedItem;
  });
}

function addCheeseAddons() {
  document.querySelectorAll('[data-menu-item]').forEach((card) => {
    const name = categoryNameFromNode(card.querySelector('.menu-heading h3'));
    if (!isCheeseAddonEligible(name)) return;
    const body = card.querySelector('.menu-body');
    const description = body && body.querySelector('p');
    if (!body || !description) return;
    if (!body.querySelector('[data-cheese-addon]')) {
      description.insertAdjacentHTML('afterend', cheeseAddonHtml());
    }
    syncCheeseAddon(card, true);
  });
}

function discountRateForSubtotal(subtotal, tiers) {
  return Object.entries(tiers || {})
    .map(([threshold, rate]) => [Number(threshold), Number(rate)])
    .filter(([threshold, rate]) => Number.isFinite(threshold) && Number.isFinite(rate))
    .sort((a, b) => b[0] - a[0])
    .reduce((matchedRate, pair) => matchedRate || (subtotal >= pair[0] ? pair[1] : 0), 0);
}

function getDeliveryType() {
  const checked = document.querySelector('input[name="delivery_type"]:checked');
  return checked ? checked.value : 'dine_in';
}

function getSelectedLocality() {
  const select = document.querySelector('[data-locality]');
  return select ? select.value : '';
}

function getSelectedSector() {
  const select = document.querySelector('[data-sector]');
  return select ? select.value : '';
}

function getCustomLocation() {
  const input = document.querySelector('[data-custom-location]');
  return input ? input.value.trim() : '';
}

function deliveryLocationLines(locality, sector, customLocation) {
  const localityNames = {
    koparkhairne: 'Koparkhairne',
    bonkhode: 'Bonkhode',
    ghansoli: 'Ghansoli',
    vashi: 'Vashi',
    other: 'Other',
  };
  const lines = [`Locality: ${localityNames[locality] || locality}`];
  if (locality === 'koparkhairne' && sector) lines.push(`Sector: Sector ${sector}`);
  if (locality === 'other' && customLocation) lines.push(`Area / Landmark: ${customLocation}`);
  return lines;
}

function deliveryChargeForSubtotal(subtotal) {
  const deliveryType = getDeliveryType();
  
  // Dine in has no delivery charges
  if (deliveryType === 'dine_in') return 0;
  
  // Home delivery - calculate based on locality and sector
  const locality = getSelectedLocality();
  
  if (locality === 'koparkhairne') {
    const sector = parseInt(getSelectedSector(), 10);
    if (!sector) return 0; // No sector selected yet
    
    // Sector 17: Free for all orders
    if (sector === 17) return 0;
    
    // Sectors 16-22: 20 for orders below 199, free above 200
    if (sector >= 16 && sector <= 22) {
      if (subtotal < 199) return 20;
      return 0;
    }
    
    // Remaining sectors (1-15, 23-26): 
    // 30 for orders below 199
    // 20 for orders 200-299
    // Free above 300
    if (subtotal < 199) return 30;
    if (subtotal < 300) return 20;
    return 0;
  }
  
  // Bonkhode and Ghansoli delivery rates.
  if (['bonkhode', 'ghansoli'].includes(locality)) {
    if (subtotal < 199) return 50;
    if (subtotal < 300) return 35;
    return 20;
  }

  // Vashi delivery rates.
  if (locality === 'vashi') {
    if (subtotal < 199) return 65;
    if (subtotal < 300) return 45;
    return 30;
  }
  
  // Other: Custom location - fixed delivery charge
  if (locality === 'other' && getCustomLocation()) {
    if (subtotal < 199) return 50;
    if (subtotal < 300) return 40;
    return 0;
  }
  
  // No locality selected yet
  return 0;
}

function deliveryNudgeForSubtotal(subtotal) {
  const deliveryType = getDeliveryType();
  
  if (deliveryType === 'dine_in') return '(Dine in - no delivery charges)';
  
  const locality = getSelectedLocality();
  
  if (!locality) return '(Select location to see delivery charges)';
  
  if (locality === 'koparkhairne') {
    const sector = parseInt(getSelectedSector(), 10);
    if (!sector) return '(Select sector to see delivery charges)';
    
    if (sector === 17) return '(Free delivery for Sector 17)';
    
    if (sector >= 16 && sector <= 22) {
      if (subtotal < 199) return `(Add ${money(199 - subtotal)} more for free delivery)`;
      return '(Free delivery unlocked)';
    }
    
    if (subtotal < 199) return `(Add ${money(199 - subtotal)} more for Rs. 20 delivery)`;
    if (subtotal < 300) return `(Add ${money(300 - subtotal)} more for free delivery)`;
    return '(Free delivery unlocked)';
  }
  
  if (['bonkhode', 'ghansoli'].includes(locality)) {
    if (subtotal < 199) return '(Delivery charge: Rs. 50)';
    if (subtotal < 300) return '(Delivery charge: Rs. 35)';
    return '(Delivery charge: Rs. 20)';
  }

  if (locality === 'vashi') {
    if (subtotal < 199) return '(Delivery charge: Rs. 65)';
    if (subtotal < 300) return '(Delivery charge: Rs. 45)';
    return '(Delivery charge: Rs. 30)';
  }
  
  if (locality === 'other' && getCustomLocation()) {
    if (subtotal < 199) return `(Add ${money(199 - subtotal)} more for Rs. 40 delivery)`;
    if (subtotal < 300) return `(Add ${money(300 - subtotal)} more for free delivery)`;
    return '(Free delivery unlocked)';
  }
  
  if (locality === 'other') return '(Enter location to see delivery charges)';
  
  return '';
}

function nextDiscountNudge(subtotal, tiers = DISCOUNT_TIERS) {
  if (subtotal <= 0) return '';

  const orderedTiers = Object.entries(tiers)
    .map(([threshold, rate]) => [Number(threshold), Number(rate)])
    .filter(([threshold, rate]) => Number.isFinite(threshold) && Number.isFinite(rate))
    .sort((a, b) => a[0] - b[0]);
  const currentTier = [...orderedTiers]
    .reverse()
    .find(([threshold]) => subtotal >= threshold);
  const nextTier = orderedTiers.find(([threshold]) => subtotal < threshold);

  if (currentTier && !nextTier) {
    const currentSavings = subtotal * currentTier[1];
    return `Thank you! You're saving ${rupeeCompact(currentSavings)} with our highest discount.`;
  }

  if (currentTier && nextTier) {
    const currentSavings = subtotal * currentTier[1];
    const [nextThreshold, nextRate] = nextTier;
    const amountAway = Math.max(0, nextThreshold - subtotal);
    const nextSavings = nextThreshold * nextRate;
    return `Congrats! You're saving ${rupeeCompact(currentSavings)}. Add ${rupeeCompact(amountAway)} more to save ${rupeeCompact(nextSavings)}.`;
  }

  if (!nextTier) return '';

  const [threshold, rate] = nextTier;
  const amountAway = Math.max(0, threshold - subtotal);
  const savings = threshold * rate;
  return `You're just ${rupeeCompact(amountAway)} away from saving ${rupeeCompact(savings)}!`;
}

function updateDiscountNudge(subtotal) {
  const message = nextDiscountNudge(subtotal);
  document.querySelectorAll('[data-discount-nudge]').forEach((node) => {
    const text = node.querySelector('[data-discount-nudge-text]');
    if (text) {
      text.textContent = message;
    } else {
      node.textContent = message;
    }
    node.hidden = message === '';
  });
}

function shouldShowIndependenceBanner() {
  const path = window.location.pathname.toLowerCase();
  const isMenuPage = document.body.classList.contains('menu-page')
    || path.endsWith('/menu.html')
    || path.endsWith('/menu.php')
    || path.endsWith('/index.html')
    || path === '/'
    || path === '';
  if (!isMenuPage) return false;

  try {
    return localStorage.getItem(INDEPENDENCE_BANNER_SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

function showIndependenceBannerPopup() {
  if (!shouldShowIndependenceBanner()) return;

  try {
    localStorage.setItem(INDEPENDENCE_BANNER_SEEN_KEY, '1');
  } catch {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'banner-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Independence month offer');
  overlay.innerHTML = `
    <div class="banner-lightbox-panel">
      <button class="banner-lightbox-close" type="button" aria-label="Close banner" data-banner-close>&times;</button>
      <img src="${escapeHtml(INDEPENDENCE_BANNER_URL)}" alt="Independence month special banner">
    </div>
  `;

  const closePopup = () => {
    overlay.remove();
    document.removeEventListener('keydown', handleEscape);
  };
  const handleEscape = (event) => {
    if (event.key === 'Escape') closePopup();
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-banner-close]')) {
      closePopup();
    }
  });
  document.addEventListener('keydown', handleEscape);
  document.body.appendChild(overlay);
  const closeButton = overlay.querySelector('[data-banner-close]');
  if (closeButton) closeButton.focus();
}

function categoryNameFromNode(node) {
  return ((node && node.textContent) || '').replace(/\s+/g, ' ').trim();
}

function normalizeStaticMenuCategories() {
  document.querySelectorAll('[data-menu-tabs]').forEach((tabGroup) => {
    const tabsContainer = tabGroup.querySelector('.menu-tabs');
    if (!tabsContainer) return;

    const panels = [...tabGroup.querySelectorAll('[data-menu-panel]')];
    const entries = [...tabsContainer.querySelectorAll('[data-menu-tab]')].map((tab) => {
      const name = categoryNameFromNode(tab);
      return {
        name,
        tab,
        panel: panels.find((panel) => panel.dataset.menuPanel === tab.dataset.menuTab),
      };
    });
    const orderedEntries = entries
      .filter((entry) => FRONTEND_CATEGORY_INDEX.has(entry.name))
      .sort((a, b) => FRONTEND_CATEGORY_INDEX.get(a.name) - FRONTEND_CATEGORY_INDEX.get(b.name));
    const activeEntry = orderedEntries.find((entry) => {
      const requestedCategory = new URLSearchParams(window.location.search).get('category');
      return requestedCategory && entry.tab.dataset.menuTab === requestedCategory;
    }) || orderedEntries[0];

    entries.forEach((entry) => {
      if (FRONTEND_CATEGORY_INDEX.has(entry.name)) return;
      entry.tab.remove();
      if (entry.panel) entry.panel.remove();
    });
    orderedEntries.forEach((entry) => {
      tabsContainer.appendChild(entry.tab);
      if (entry.panel) tabGroup.appendChild(entry.panel);

      const isActive = entry === activeEntry;
      entry.tab.classList.toggle('active', isActive);
      entry.tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if (entry.panel) entry.panel.hidden = !isActive;
    });
  });

  document.querySelectorAll('.menu-accordion-layout').forEach((layout) => {
    const entries = [...layout.querySelectorAll('.menu-accordion')].map((details) => ({
      name: categoryNameFromNode(details.querySelector('summary')),
      details,
    }));
    const orderedEntries = entries
      .filter((entry) => FRONTEND_CATEGORY_INDEX.has(entry.name))
      .sort((a, b) => FRONTEND_CATEGORY_INDEX.get(a.name) - FRONTEND_CATEGORY_INDEX.get(b.name));

    entries.forEach((entry) => {
      if (!FRONTEND_CATEGORY_INDEX.has(entry.name)) entry.details.remove();
    });
    orderedEntries.forEach((entry, index) => {
      layout.appendChild(entry.details);
      entry.details.open = index === 0;
    });
  });
}

function moveMenuItemsToCategory(itemNames, sourceCategory, targetCategory) {
  const names = new Set(itemNames);
  const shouldMove = (card) => names.has(categoryNameFromNode(card.querySelector('.menu-heading h3')));

  document.querySelectorAll('[data-menu-tabs]').forEach((tabGroup) => {
    const tabs = [...tabGroup.querySelectorAll('[data-menu-tab]')];
    const sourceTab = tabs.find((tab) => categoryNameFromNode(tab) === sourceCategory);
    const targetTab = tabs.find((tab) => categoryNameFromNode(tab) === targetCategory);
    if (!sourceTab || !targetTab) return;

    const sourcePanel = [...tabGroup.querySelectorAll('[data-menu-panel]')]
      .find((panel) => panel.dataset.menuPanel === sourceTab.dataset.menuTab);
    const targetPanel = [...tabGroup.querySelectorAll('[data-menu-panel]')]
      .find((panel) => panel.dataset.menuPanel === targetTab.dataset.menuTab);
    const targetGrid = targetPanel && targetPanel.querySelector('.menu-grid');
    if (!sourcePanel || !targetGrid) return;

    [...sourcePanel.querySelectorAll('[data-menu-item]')]
      .filter(shouldMove)
      .forEach((card) => targetGrid.appendChild(card));
  });

  document.querySelectorAll('.menu-accordion-layout').forEach((layout) => {
    const sections = [...layout.querySelectorAll('.menu-accordion')];
    const source = sections.find((section) => categoryNameFromNode(section.querySelector('summary')) === sourceCategory);
    const target = sections.find((section) => categoryNameFromNode(section.querySelector('summary')) === targetCategory);
    const targetGrid = target && target.querySelector('.menu-grid');
    if (!source || !targetGrid) return;

    [...source.querySelectorAll('[data-menu-item]')]
      .filter(shouldMove)
      .forEach((card) => targetGrid.appendChild(card));
  });
}

function categoryEntriesForTabGroup(tabGroup) {
  const tabsContainer = tabGroup.querySelector('.menu-tabs');
  if (!tabsContainer) return [];
  const panels = [...tabGroup.querySelectorAll('[data-menu-panel]')];
  return [...tabsContainer.querySelectorAll('[data-menu-tab]')].map((tab) => ({
    tab,
    panel: panels.find((panel) => panel.dataset.menuPanel === tab.dataset.menuTab),
  }));
}

function removeEmptyMenuCategories() {
  document.querySelectorAll('[data-menu-tabs]').forEach((tabGroup) => {
    const entries = categoryEntriesForTabGroup(tabGroup);
    const emptyEntries = entries.filter((entry) => entry.panel && !entry.panel.querySelector('[data-menu-item]'));
    const activeTabRemoved = emptyEntries.some((entry) => entry.tab.classList.contains('active'));

    emptyEntries.forEach((entry) => {
      entry.tab.remove();
      if (entry.panel) entry.panel.remove();
    });

    if (!activeTabRemoved) return;
    const nextTab = tabGroup.querySelector('[data-menu-tab]');
    if (!nextTab) return;

    tabGroup.querySelectorAll('[data-menu-tab]').forEach((tab) => {
      const isActive = tab === nextTab;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    tabGroup.querySelectorAll('[data-menu-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.menuPanel !== nextTab.dataset.menuTab;
    });
  });

  document.querySelectorAll('.menu-accordion-layout .menu-accordion').forEach((details) => {
    if (!details.querySelector('[data-menu-item]')) details.remove();
  });
}

// The menu is owned by the database. Rendering it from /api/menu means the
// customer always submits the same food-item ID, name and price the admin sees.
const LEGACY_MENU_NAMES = new Map([
  ['Egg Burji + 2 Pav (Single)', 'Single Egg Burjee + 2 Butter Pav'],
  ['Egg Burji + 2 Pav (Double)', 'Double Egg Burjee + 4 Butter Pav'],
  ['Egg Omelet + 2 Pav (Single)', 'Single Egg Omelet + 2 Butter Pav'],
  ['Egg Omelet + 2 Pav (Double)', 'Double Omelet + 4 Butter Pav'],
]);

function menuCategoryOrder(left, right) {
  const leftIndex = FRONTEND_CATEGORY_INDEX.has(left) ? FRONTEND_CATEGORY_INDEX.get(left) : Number.MAX_SAFE_INTEGER;
  const rightIndex = FRONTEND_CATEGORY_INDEX.has(right) ? FRONTEND_CATEGORY_INDEX.get(right) : Number.MAX_SAFE_INTEGER;
  return leftIndex - rightIndex || left.localeCompare(right);
}

function syncCartWithMenu(items) {
  const byName = new Map(items.map((item) => [String(item.name).trim().toLowerCase(), item]));
  const cart = getCart();
  const nextCart = cart.map((cartItem) => {
    const currentName = LEGACY_MENU_NAMES.get(cartItem.name) || cartItem.name;
    const item = byName.get(String(currentName || '').trim().toLowerCase());
    return item ? {
      ...cartItem,
      id: Number(item.id),
      name: item.name,
      price: Number(item.price),
      image: item.image,
    } : null;
  }).filter(Boolean);
  if (JSON.stringify(cart) !== JSON.stringify(nextCart)) saveCart(nextCart);
}

function renderDatabaseMenu(items) {
  const categories = items.reduce((groups, item) => {
    const name = item.category && item.category.name ? item.category.name : 'Menu';
    groups.set(name, [...(groups.get(name) || []), item]);
    return groups;
  }, new Map());
  const groups = [...categories.entries()].sort(([left], [right]) => menuCategoryOrder(left, right));

  document.querySelectorAll('[data-menu-tabs]').forEach((tabGroup) => {
    const tabs = tabGroup.querySelector('.menu-tabs');
    if (!tabs) return;
    tabs.replaceChildren();
    tabGroup.querySelectorAll('[data-menu-panel]').forEach((panel) => panel.remove());
    groups.forEach(([category, categoryItems], index) => {
      const categoryId = String(categoryItems[0].categoryId);
      const tab = document.createElement('button');
      tab.className = `menu-tab${index === 0 ? ' active' : ''}`;
      tab.type = 'button'; tab.role = 'tab'; tab.id = `menu-tab-${categoryId}`;
      tab.dataset.menuTab = categoryId; tab.setAttribute('aria-controls', `menu-panel-${categoryId}`);
      tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false'); tab.textContent = category;
      const panel = document.createElement('section');
      panel.className = 'menu-tab-panel'; panel.id = `menu-panel-${categoryId}`; panel.role = 'tabpanel';
      panel.dataset.menuPanel = categoryId; panel.setAttribute('aria-labelledby', tab.id); panel.hidden = index !== 0;
      panel.innerHTML = `<div class="menu-grid">${categoryItems.map(menuCardHtml).join('')}</div>`;
      tabs.appendChild(tab); tabGroup.appendChild(panel);
    });
  });

  document.querySelectorAll('.menu-accordion-layout').forEach((layout) => {
    layout.replaceChildren();
    groups.forEach(([category, categoryItems], index) => {
      const details = document.createElement('details');
      details.className = 'menu-accordion'; details.open = index === 0;
      details.innerHTML = `<summary>${escapeHtml(category)}</summary><div class="menu-grid">${categoryItems.map(menuCardHtml).join('')}</div>`;
      layout.appendChild(details);
    });
  });
}

async function syncMenuFromDatabase() {
  if (!document.querySelector('[data-menu-item]')) return;
  try {
    const response = await fetch(apiUrl('/menu'), { headers: { Accept: 'application/json' } });
    const items = await response.json();
    if (!response.ok || !Array.isArray(items)) return;
    renderDatabaseMenu(items);
    syncCartWithMenu(items);
    ensureMenuSearchResults();
    addCheeseAddons();
    renderCartControls();
    applyMenuFilters();
  } catch {
    // Preserve the server-rendered fallback if the menu API is temporarily unavailable.
  }
}

function initAboutParallax() {
  const cards = [...document.querySelectorAll('[data-about-parallax]')];
  if (!cards.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let framePending = false;
  const update = () => {
    const viewportMiddle = window.innerHeight / 2;
    const stickyTop = window.innerWidth <= 820 ? 76 : 82;
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const distance = Math.max(-1, Math.min(1, (rect.top + rect.height / 2 - viewportMiddle) / window.innerHeight));
      card.style.setProperty('--parallax-shift', `${distance * -11}%`);
      const entering = index === 0 ? 1 : Math.max(0, Math.min(1, (window.innerHeight * 0.96 - rect.top) / (window.innerHeight * 0.62)));
      const nextCard = cards[index + 1];
      const nextTop = nextCard ? nextCard.getBoundingClientRect().top : window.innerHeight * 2;
      const exiting = nextCard ? Math.max(0, Math.min(1, (window.innerHeight * 0.7 - nextTop) / (window.innerHeight * 0.7 - stickyTop))) : 0;
      card.style.setProperty('--gallery-opacity', String(Math.max(0.18, entering * (1 - exiting * 0.7))));
      card.style.setProperty('--gallery-scale', String(0.93 + entering * 0.07 - exiting * 0.025));
      card.style.setProperty('--gallery-lift', `${(1 - entering) * 34 - exiting * 8}px`);
    });
    framePending = false;
  };
  const requestUpdate = () => {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  requestUpdate();
}

function menuCardHtml(item) {
  const cartItem = JSON.stringify({
    id: item.id,
    name: item.name,
    price: item.price,
    image: item.image,
  });
  return `
    <article class="card menu-card" data-menu-item data-name="${escapeHtml(`${item.name} ${item.description}`.toLowerCase())}" data-veg="${item.isVeg ? 'veg' : 'nonveg'}">
      <div class="image-wrap">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
        <span class="badge ${item.isVeg ? 'veg' : 'nonveg'}">${item.isVeg ? 'Veg' : 'Non-Veg'}</span>
      </div>
      <div class="menu-body">
        <div class="menu-heading">
          <h3>${escapeHtml(item.name)}</h3>
          <strong>${money(item.price)}</strong>
        </div>
        <p>${escapeHtml(item.description)}</p>
        ${isCheeseAddonEligible(item.name) ? cheeseAddonHtml() : ''}
        <div class="cart-control" data-cart-control data-id="${item.id}" data-cart-item='${escapeHtml(cartItem)}'>
          <button class="btn primary full" type="button" data-add-cart data-item='${escapeHtml(cartItem)}'>Add</button>
        </div>
      </div>
    </article>
  `;
}

function ensureMenuSearchResults() {
  document.querySelectorAll('.menu-app-shell').forEach((shell) => {
    if (shell.querySelector('[data-menu-search-results]')) return;

    const toolbar = shell.querySelector('.toolbar');
    if (!toolbar) return;

    const section = document.createElement('section');
    section.className = 'menu-search-results';
    section.dataset.menuSearchResults = '';
    section.hidden = true;
    section.innerHTML = `
      <div class="menu-search-results-head">
        <h2>Search Results</h2>
        <span data-menu-search-count></span>
      </div>
      <div class="menu-grid" data-menu-search-grid></div>
      <p class="menu-search-empty" data-menu-search-empty hidden>No matching food items found.</p>
    `;
    toolbar.insertAdjacentElement('afterend', section);
  });
}

function menuItemFromCard(card) {
  const control = card.querySelector('[data-cart-control]');
  const cartItem = control && control.dataset.cartItem ? JSON.parse(control.dataset.cartItem) : {};
  const name = cartItem.name || categoryNameFromNode(card.querySelector('.menu-heading h3'));
  const description = categoryNameFromNode(card.querySelector('.menu-body p'));
  const priceNode = card.querySelector('.menu-heading strong');
  const imageNode = card.querySelector('.image-wrap img');
  const price = Number(cartItem.price || parseMoney(priceNode && priceNode.textContent));
  const image = cartItem.image || (imageNode && imageNode.getAttribute('src')) || '';

  return {
    id: Number(cartItem.id || (control && control.dataset.id) || 0),
    name,
    description,
    price,
    image,
    isVeg: card.dataset.veg !== 'nonveg',
    searchText: card.dataset.name || `${name} ${description}`.toLowerCase(),
  };
}

function collectSearchableMenuItems() {
  const seen = new Set();
  return [...document.querySelectorAll('.menu-tabs-layout [data-menu-item], .menu-accordion-layout [data-menu-item]')]
    .map(menuItemFromCard)
    .filter((item) => {
      const key = item.name.toLowerCase();
      if (!item.id || !item.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function renderMenuSearchResults(query, vegMode) {
  const searchSection = document.querySelector('[data-menu-search-results]');
  if (!searchSection) return;

  const grid = searchSection.querySelector('[data-menu-search-grid]');
  const count = searchSection.querySelector('[data-menu-search-count]');
  const empty = searchSection.querySelector('[data-menu-search-empty]');
  if (!grid || !count || !empty) return;

  if (!query) {
    searchSection.hidden = true;
    grid.innerHTML = '';
    count.textContent = '';
    empty.hidden = true;
    return;
  }

  const matches = collectSearchableMenuItems().filter((item) => {
    const matchesSearch = item.searchText.includes(query);
    const matchesVeg = vegMode === 'all' || (item.isVeg ? 'veg' : 'nonveg') === vegMode;
    return matchesSearch && matchesVeg;
  });

  searchSection.hidden = false;
  count.textContent = matches.length === 1 ? '1 item found' : `${matches.length} items found`;
  grid.innerHTML = matches.map(menuCardHtml).join('');
  empty.hidden = matches.length > 0;
  addCheeseAddons();
  renderCartControls();
}

function ensureStaticCategory(category) {
  document.querySelectorAll('[data-menu-tabs]').forEach((tabGroup) => {
    const tabsContainer = tabGroup.querySelector('.menu-tabs');
    if (!tabsContainer) return;

    const existingTab = [...tabsContainer.querySelectorAll('[data-menu-tab]')]
      .find((tab) => categoryNameFromNode(tab) === category.name);
    if (existingTab) return;

    const tab = document.createElement('button');
    tab.className = 'menu-tab';
    tab.type = 'button';
    tab.role = 'tab';
    tab.id = `menu-tab-${category.slug}`;
    tab.dataset.menuTab = category.slug;
    tab.setAttribute('aria-controls', `menu-panel-${category.slug}`);
    tab.setAttribute('aria-selected', 'false');
    tab.textContent = category.name;

    const panel = document.createElement('section');
    panel.className = 'menu-tab-panel';
    panel.id = `menu-panel-${category.slug}`;
    panel.role = 'tabpanel';
    panel.dataset.menuPanel = category.slug;
    panel.setAttribute('aria-labelledby', tab.id);
    panel.hidden = true;

    const grid = document.createElement('div');
    grid.className = 'menu-grid';
    panel.appendChild(grid);

    tabsContainer.appendChild(tab);
    tabGroup.appendChild(panel);
  });

  document.querySelectorAll('.menu-accordion-layout').forEach((layout) => {
    const existingDetails = [...layout.querySelectorAll('.menu-accordion')]
      .find((details) => categoryNameFromNode(details.querySelector('summary')) === category.name);
    if (existingDetails) return;

    const details = document.createElement('details');
    details.className = 'menu-accordion';
    const summary = document.createElement('summary');
    summary.textContent = category.name;
    const grid = document.createElement('div');
    grid.className = 'menu-grid';
    details.append(summary, grid);
    layout.appendChild(details);
  });
}

function hydrateStaticMenuAdditions() {
  ADDITIONAL_STATIC_CATEGORIES.forEach(ensureStaticCategory);
  const itemsByCategory = ADDITIONAL_STATIC_MENU_ITEMS.reduce((groups, item) => {
    groups.set(item.categoryName, [...(groups.get(item.categoryName) || []), item]);
    return groups;
  }, new Map());

  itemsByCategory.forEach((items, categoryName) => {
    const categoryTabs = [...document.querySelectorAll('[data-menu-tab]')]
      .filter((tab) => categoryNameFromNode(tab) === categoryName);
    const panels = categoryTabs
      .map((tab) => [...document.querySelectorAll('[data-menu-panel]')]
        .find((panel) => panel.dataset.menuPanel === tab.dataset.menuTab))
      .filter(Boolean);

    document.querySelectorAll('.menu-accordion').forEach((details) => {
      if (categoryNameFromNode(details.querySelector('summary')) === categoryName) {
        panels.push(details);
      }
    });

    panels.forEach((panel) => {
      const grid = panel.querySelector('.menu-grid');
      if (!grid) return;
      const existingNames = new Set([...grid.querySelectorAll('.menu-card h3')].map((node) => categoryNameFromNode(node)));
      items.forEach((item) => {
      if (!existingNames.has(item.name)) {
        grid.insertAdjacentHTML('beforeend', menuCardHtml(item));
      }
    });
    });
  });
}

function changeQuantity(id, quantity) {
  const cart = getCart();
  const next = cart
    .map((item) => item.id === id ? { ...item, quantity } : item)
    .filter((item) => item.quantity > 0);
  saveCart(next);
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find((current) => current.id === item.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...item, quantity: 1 });
  }
  saveCart(cart);
}

function renderCartControls() {
  const cart = getCart();
  document.querySelectorAll('[data-cart-control]').forEach((control) => {
    const id = Number(control.dataset.id);
    const found = cart.find((item) => item.id === id);
    if (!found) {
      if (control.dataset.cartItem) {
        const button = document.createElement('button');
        button.className = 'btn primary full';
        button.type = 'button';
        button.dataset.addCart = '';
        button.dataset.item = control.dataset.cartItem;
        button.textContent = 'Add';
        control.innerHTML = '';
        control.appendChild(button);
      }
      return;
    }
    control.innerHTML = `
      <div class="qty-control">
        <button type="button" data-qty="${id}" data-value="${found.quantity - 1}">-</button>
        <strong>${found.quantity}</strong>
        <button type="button" data-qty="${id}" data-value="${found.quantity + 1}">+</button>
      </div>
    `;
  });
}

function renderCheckout() {
  const cart = getCart();
  const target = document.querySelector('[data-checkout-items]');
  const gstRate = Number((target && target.dataset.gstRate) || 0);
  let discountTiers = {};
  if (target && target.dataset.discountTiers) {
    try {
      discountTiers = JSON.parse(target.dataset.discountTiers);
    } catch {
      // The cart must still render if an optional pricing setting is invalid.
    }
  }
  const visibleCart = cart;
  const removedCount = 0;
  const subtotal = visibleCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const gst = Number((subtotal * gstRate).toFixed(2));
  const discountRate = discountRateForSubtotal(subtotal, discountTiers);
  const discount = Number((subtotal * discountRate).toFixed(2));
  const referralDiscount = referralDiscountForSubtotal(subtotal);
  const studentDiscount = studentDiscountForSubtotal(subtotal);
  const deliveryCharge = deliveryChargeForSubtotal(subtotal);
  // Cashback can be redeemed only against the food bill. Delivery stays payable.
  const foodBillBeforeCashback = subtotal + gst - discount - referralDiscount - studentDiscount;
  const cashbackRedeemed = cashbackAppliedFor(foodBillBeforeCashback);
  const grandTotal = Math.max(0, Number((foodBillBeforeCashback - cashbackRedeemed + deliveryCharge).toFixed(2)));
  document.querySelectorAll('[data-checkout-subtotal]').forEach((node) => node.textContent = money(subtotal));
  document.querySelectorAll('[data-checkout-gst]').forEach((node) => node.textContent = money(gst));
  document.querySelectorAll('[data-checkout-discount]').forEach((node) => node.textContent = money(discount));
  document.querySelectorAll('[data-checkout-referral-discount]').forEach((node) => node.textContent = money(referralDiscount));
  document.querySelectorAll('[data-checkout-referral-row]').forEach((node) => node.hidden = referralDiscount <= 0);
  document.querySelectorAll('[data-student-discount]').forEach((node) => node.textContent = money(studentDiscount));
  document.querySelectorAll('[data-student-discount-row]').forEach((node) => node.hidden = studentDiscount <= 0);
  document.querySelectorAll('[data-checkout-delivery]').forEach((node) => node.textContent = money(deliveryCharge));
  document.querySelectorAll('[data-checkout-cashback]').forEach((node) => node.textContent = money(cashbackRedeemed));
  document.querySelectorAll('[data-checkout-cashback-row]').forEach((node) => node.hidden = cashbackRedeemed <= 0);
  document.querySelectorAll('[data-delivery-nudge]').forEach((node) => node.textContent = deliveryNudgeForSubtotal(subtotal));
  document.querySelectorAll('[data-checkout-total], [data-upi-total]').forEach((node) => node.textContent = money(grandTotal));
  document.querySelectorAll('[data-cart-json]').forEach((node) => node.value = JSON.stringify(visibleCart));
  renderCashbackPanel(foodBillBeforeCashback, cashbackRedeemed);
  renderSavedAddressPicker();
  if (!target) return;

  if (!visibleCart.length) {
    target.innerHTML = removedCount
      ? '<p class="muted">Items in your cart are no longer active. Add available items from the menu.</p>'
      : '<p class="muted">Your cart is empty. Add items from the menu.</p>';
    return;
  }

  target.innerHTML = `${removedCount ? '<p class="alert">Some inactive items were removed from checkout.</p>' : ''}${visibleCart.map((item) => {
    const itemId = Number(item.id);
    const itemName = escapeHtml(item.name);
    const quantity = Number(item.quantity || 0);
    return `
    <div class="checkout-item">
      <strong class="checkout-item-name">${itemName}</strong>
      <div class="checkout-item-details">
        <div class="qty-control checkout-qty-control" aria-label="Quantity for ${itemName}">
          <button type="button" data-qty="${itemId}" data-value="${quantity - 1}" aria-label="Decrease ${itemName} quantity">-</button>
          <strong>${quantity}</strong>
          <button type="button" data-qty="${itemId}" data-value="${quantity + 1}" aria-label="Increase ${itemName} quantity">+</button>
        </div>
        <strong class="checkout-line-price">${money(item.price * quantity)}</strong>
        <button class="icon-remove" type="button" data-remove="${itemId}" aria-label="Remove ${itemName} from cart" title="Remove">
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M3 6h18"></path>
            <path d="M8 6V4h8v2"></path>
            <path d="M6 6l1 18h10l1-18"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
  }).join('')}`;
}

document.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add-cart]');
  if (add) {
    addToCart(JSON.parse(add.dataset.item));
  }

  const qty = event.target.closest('[data-qty]');
  if (qty) {
    changeQuantity(Number(qty.dataset.qty), Number(qty.dataset.value));
  }

  const remove = event.target.closest('[data-remove]');
  if (remove) {
    changeQuantity(Number(remove.dataset.remove), 0);
  }

  const walletModeBtn = event.target.closest('[data-wallet-mode-btn]');
  if (walletModeBtn) {
    const panel = walletModeBtn.closest('[data-cashback-panel]');
    if (panel) {
      panel.dataset.walletMode = walletModeBtn.dataset.walletModeBtn;
      try {
        localStorage.setItem(CASHBACK_WALLET_MODE_KEY, walletModeBtn.dataset.walletModeBtn);
      } catch {
        // ignore storage errors
      }
      renderCashbackPanel();
    }
  }

  const navToggle = event.target.closest('[data-nav-toggle]');
  if (navToggle) {
    const nav = document.querySelector('[data-nav]');
    if (nav) nav.classList.toggle('open');
  }

  const upiLink = event.target.closest('[data-upi-link]');
  if (upiLink) {
    const href = upiLink.getAttribute('href');
    if (href && href !== '#') {
      event.preventDefault();
      window.location.href = href;
    }
  }

  const cashbackLogout = event.target.closest('[data-cashback-logout]');
  if (cashbackLogout) {
    localStorage.removeItem(CUSTOMER_AUTH_KEY);
    localStorage.removeItem(CASHBACK_REDEEM_KEY);
    renderCheckout();
  }

  const redeemAll = event.target.closest('[data-cashback-redeem-all]');
  if (redeemAll) {
    localStorage.setItem(CASHBACK_REDEEM_KEY, String(Number(redeemAll.dataset.amount) || 0));
    renderCheckout();
  }

  const redeemRemove = event.target.closest('[data-cashback-redeem-remove]');
  if (redeemRemove) {
    localStorage.removeItem(CASHBACK_REDEEM_KEY);
    renderCheckout();
  }

  const referralApply = event.target.closest('[data-referral-apply]');
  if (referralApply) {
    event.preventDefault();
    const input = document.querySelector('[data-referral-code]');
    const status = document.querySelector('[data-referral-status]');
    if (appliedReferralCode()) {
      localStorage.removeItem(CASHBACK_REFERRAL_KEY);
      if (input) input.value = '';
      if (status) { status.textContent = ''; status.className = 'referral-status'; }
      renderCheckout();
      renderReferralState();
      return;
    }
    const code = ((input && input.value) || '').trim().toUpperCase();
    if (!code) {
      if (status) { status.textContent = 'Please enter a referral code.'; status.classList.add('error'); status.classList.remove('ok'); }
      return;
    }
    const walletPanel = document.querySelector('[data-cashback-panel]');
    const numberInput = walletPanel && walletPanel.querySelector('[data-wallet-number]');
    const referralAuth = getCustomerAuth();
    const mobileNumber = String((referralAuth && referralAuth.customer && referralAuth.customer.mobileNumber) || (numberInput && numberInput.value) || '').trim();
    const originalText = referralApply.textContent;
    referralApply.disabled = true;
    referralApply.textContent = 'Checking...';
    fetch(apiUrl('/customer/referral/validate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code, mobileNumber }),
    })
      .then((response) => response.json().catch(() => ({})))
      .then((result) => {
        if (result.valid) {
          localStorage.setItem(CASHBACK_REFERRAL_KEY, code);
          if (status) { status.textContent = result.message || '5% referral discount applied!'; status.classList.add('ok'); status.classList.remove('error'); }
        } else {
          localStorage.removeItem(CASHBACK_REFERRAL_KEY);
          if (status) { status.textContent = result.message || 'Invalid referral code.'; status.classList.add('error'); status.classList.remove('ok'); }
        }
        renderCheckout();
        renderReferralState();
      })
      .catch(() => {
        localStorage.removeItem(CASHBACK_REFERRAL_KEY);
        if (status) { status.textContent = 'Could not validate referral code. Please try again.'; status.classList.add('error'); status.classList.remove('ok'); }
      })
      .finally(() => {
        referralApply.disabled = false;
        referralApply.textContent = originalText;
      });
  }

  const copyReferral = event.target.closest('[data-copy-referral]');
  if (copyReferral) {
    const card = copyReferral.closest('[data-referral-share-card]');
    const code = card && card.querySelector('[data-referral-code-value]');
    const copied = card && card.querySelector('[data-referral-copied]');
    if (code && code.textContent) {
      const text = code.textContent.trim();
      const done = () => {
        if (copied) {
          copied.hidden = false;
          setTimeout(() => { copied.hidden = true; }, 1800);
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {
          fallbackCopyText(text);
          done();
        });
      } else {
        fallbackCopyText(text);
        done();
      }
    }
  }

  const accountLogout = event.target.closest('[data-account-logout]');
  if (accountLogout) {
    localStorage.removeItem(CUSTOMER_AUTH_KEY);
    localStorage.removeItem(CASHBACK_REDEEM_KEY);
    renderAccount(null);
  }

  const savedAddressSelect = event.target.closest('[data-saved-address-select]');
  if (savedAddressSelect) {
    const savedAddress = savedAddressesForCustomer().find((entry) => Number(entry.id) === Number(savedAddressSelect.dataset.savedAddressSelect));
    const addressInput = document.querySelector('[name="address"]');
    const labelSelect = document.querySelector('[data-address-label]');
    const customLabel = document.querySelector('[data-custom-address-label]');
    const customLabelInput = document.querySelector('[name="custom_address_label"]');
    if (savedAddress && addressInput) {
      addressInput.value = savedAddress.address;
      const presetLabels = ['Home', 'Office', 'Shop'];
      if (labelSelect) labelSelect.value = presetLabels.includes(savedAddress.label) ? savedAddress.label : 'Custom';
      if (customLabel) customLabel.hidden = presetLabels.includes(savedAddress.label);
      if (customLabelInput) customLabelInput.value = presetLabels.includes(savedAddress.label) ? '' : savedAddress.label;
    }
  }

  const savedAddressDelete = event.target.closest('[data-saved-address-delete]');
  if (savedAddressDelete) {
    const auth = getCustomerAuth();
    if (!auth) return;
    fetch(apiUrl(`/customer/addresses/${Number(savedAddressDelete.dataset.savedAddressDelete)}`), {
      method: 'DELETE',
      headers: { Accept: 'application/json', Authorization: `Bearer ${auth.token}` },
    }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not remove the address.');
      saveCustomerAuth({ token: auth.token, expiresAt: auth.expiresAt, customer: result.customer, transactions: result.transactions || [] });
      loadCustomerAccount();
      renderSavedAddressPicker();
    }).catch((error) => alert(error.message || 'Could not remove the address.'));
  }

  const menuTab = event.target.closest('[data-menu-tab]');
  if (menuTab) {
    const tabGroup = menuTab.closest('[data-menu-tabs]');
    const activeCategory = menuTab.dataset.menuTab;
    if (tabGroup) tabGroup.querySelectorAll('[data-menu-tab]').forEach((tab) => {
      const isActive = tab === menuTab;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (tabGroup) tabGroup.querySelectorAll('[data-menu-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.menuPanel !== activeCategory;
    });
    applyMenuFilters();
  }
});

document.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-cheese-addon]');
  if (!checkbox) return;
  const card = checkbox.closest('[data-menu-item]');
  const control = card && card.querySelector('[data-cart-control]');
  if (!card || !control) return;

  const baseItem = JSON.parse(control.dataset.baseCartItem || control.dataset.cartItem || '{}');
  const baseId = Number(baseItem.id);
  const addonId = baseId + 10000;
  const cart = getCart();
  const baseIndex = cart.findIndex((item) => Number(item.id) === baseId);
  const addonIndex = cart.findIndex((item) => Number(item.id) === addonId);

  if (checkbox.checked && baseIndex !== -1) {
    const upgradedItem = {
      ...cart[baseIndex],
      id: addonId,
      name: `${baseItem.name} + Cheese`,
      price: Number(baseItem.price) + 19,
    };
    if (addonIndex !== -1) {
      cart[addonIndex].quantity += upgradedItem.quantity;
      cart.splice(baseIndex, 1);
    } else {
      cart[baseIndex] = upgradedItem;
    }
    saveCart(cart);
  } else if (!checkbox.checked && addonIndex !== -1) {
    cart[addonIndex] = {
      ...cart[addonIndex],
      id: baseId,
      name: baseItem.name,
      price: Number(baseItem.price),
    };
    saveCart(cart);
  }
  syncCheeseAddon(card);
  renderCartControls();
});

document.addEventListener('change', (event) => {
  const labelSelect = event.target.closest('[data-address-label]');
  if (!labelSelect) return;
  const customLabel = document.querySelector('[data-custom-address-label]');
  if (customLabel) customLabel.hidden = labelSelect.value !== 'Custom';
});

document.addEventListener('submit', async (event) => {
  const accountLoginForm = event.target.closest('[data-account-login-form]');
  if (accountLoginForm) {
    event.preventDefault();
    const mobileNumber = normalizeMobileNumber(new FormData(accountLoginForm).get('mobile_number'));
    const submitButton = accountLoginForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const response = await fetch(apiUrl('/customer/request-otp'), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ mobileNumber }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not send OTP.');
      if (result.provider === 'msg91') {
        const requestId = await sendMsg91Otp(result.mobileNumber || mobileNumber);
        localStorage.setItem(CASHBACK_OTP_KEY, JSON.stringify({ mobileNumber: result.mobileNumber || mobileNumber, testOtp: result.testOtp || '', provider: result.provider || 'test', expiresAt: result.expiresAt, requestId }));
        renderAccount(null);
        return;
      }
      localStorage.setItem(CASHBACK_OTP_KEY, JSON.stringify({ mobileNumber: result.mobileNumber || mobileNumber, testOtp: result.testOtp || '', provider: result.provider || 'test', expiresAt: result.expiresAt }));
      renderAccount(null);
    } catch (error) {
      alert(error.message || 'Could not send OTP.');
      if (submitButton) submitButton.disabled = false;
    }
    return;
  }

  const accountVerifyForm = event.target.closest('[data-account-verify-form]');
  if (accountVerifyForm) {
    event.preventDefault();
    const formData = new FormData(accountVerifyForm);
    const submitButton = accountVerifyForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      const pending = getPendingCashbackOtp();
      const msg91RequestId = pending?.provider === 'msg91' ? (pending.requestId || msg91RequestId) : '';
      const response = await fetch(apiUrl('/customer/verify-otp'), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ mobileNumber: normalizeMobileNumber(formData.get('mobile_number')), otp: formData.get('otp'), msg91RequestId }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not verify OTP.');
      localStorage.removeItem(CASHBACK_OTP_KEY);
      saveCustomerAuth({ token: result.token, expiresAt: result.expiresAt, customer: result.customer, transactions: result.transactions || [] });
      loadCustomerAccount();
    } catch (error) {
      alert(error.message || 'Could not verify OTP.');
      if (submitButton) submitButton.disabled = false;
    }
    return;
  }

  const loginForm = event.target.closest('[data-cashback-login-form]');
  if (loginForm) {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const customerName = String(formData.get('customer_name') || '').trim();
    const mobileNumber = normalizeMobileNumber(formData.get('mobile_number'));
    const panel = loginForm.closest('[data-cashback-panel]');
    const walletMode = (panel && panel.dataset.walletMode) || 'existing';
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const originalText = submitButton && submitButton.textContent || 'Send OTP';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }

    try {
      const response = await fetch(apiUrl('/customer/request-otp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          mobileNumber,
          name: customerName,
          intent: walletMode,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if ((result.notRegistered || result.existingUser) && panel) {
          const requiredMode = result.existingUser ? 'existing' : 'new';
          panel.dataset.walletMode = requiredMode;
          try {
            localStorage.setItem(CASHBACK_WALLET_MODE_KEY, requiredMode);
          } catch {
            // ignore storage errors
          }
          renderCheckout();
        }
        throw new Error(result.error || 'Could not send OTP.');
      }
      const requestId = result.provider === 'msg91' ? await sendMsg91Otp(result.mobileNumber || mobileNumber) : '';
      localStorage.setItem(CASHBACK_OTP_KEY, JSON.stringify({
        mobileNumber: result.mobileNumber || mobileNumber,
        testOtp: result.testOtp || '',
        provider: result.provider || 'test',
        expiresAt: result.expiresAt,
        requestId,
        intent: walletMode,
        name: customerName,
      }));
      renderCheckout();
    } catch (error) {
      alert(error.message || 'Could not send OTP.');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
    return;
  }

  const verifyForm = event.target.closest('[data-cashback-verify-form]');
  if (verifyForm) {
    event.preventDefault();
    const formData = new FormData(verifyForm);
    const submitButton = verifyForm.querySelector('button[type="submit"]');
    const originalText = submitButton && submitButton.textContent || 'Login to Wallet';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Verifying...';
    }

    try {
      const pending = getPendingCashbackOtp();
      const msg91RequestId = pending?.provider === 'msg91' ? (pending.requestId || msg91RequestId) : '';
      const response = await fetch(apiUrl('/customer/verify-otp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          mobileNumber: normalizeMobileNumber(formData.get('mobile_number')),
          otp: formData.get('otp'),
          msg91RequestId,
          intent: pending?.intent || 'existing',
          name: pending?.name || '',
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not verify OTP.');
      localStorage.removeItem(CASHBACK_OTP_KEY);
      saveCustomerAuth({
        token: result.token,
        expiresAt: result.expiresAt,
        customer: result.customer,
        transactions: result.transactions || [],
      });
      renderCheckout();
    } catch (error) {
      alert(error.message || 'Could not verify OTP.');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  }

  const specialDayForm = event.target.closest('[data-special-day-save-form]');
  if (specialDayForm) {
    event.preventDefault();
    const submitButton = specialDayForm.querySelector('button[type="submit"]');
    const statusNode = specialDayForm.querySelector('[data-special-day-status]');
    const originalText = submitButton ? submitButton.textContent : '';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Saving...';
    }

    const birthday = specialDayForm.querySelector('[data-date-group="birthday"] [data-date-value]').value || null;
    const auth = getCustomerAuth();
    const session = getActiveOrderSession();
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (auth && auth.token) headers.Authorization = `Bearer ${auth.token}`;
    const body = { birthday };
    if (!(auth && auth.token)) {
      if (!session) {
        if (statusNode) {
          statusNode.textContent = 'Please login to save your special days.';
          statusNode.classList.add('error');
        }
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalText;
        }
        return;
      }
      body.orderNumber = session.orderNumber;
      body.orderSessionToken = session.token;
    }

    try {
      const response = await fetch(apiUrl('/customer/profile'), {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save your special days.');
      if (result.customer && auth) {
        saveCustomerAuth({ token: auth.token, expiresAt: auth.expiresAt, customer: result.customer, transactions: result.transactions || [] });
      }
      if (statusNode) {
        statusNode.textContent = 'Saved! We will surprise you on your special day.';
        statusNode.classList.add('ok');
        statusNode.classList.remove('error');
      }
    } catch (error) {
      if (statusNode) {
        statusNode.textContent = error.message || 'Could not save your special days.';
        statusNode.classList.add('error');
        statusNode.classList.remove('ok');
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  }
});

function applyMenuFilters() {
  const searchInput = document.querySelector('[data-menu-search]');
  const activeVeg = document.querySelector('[data-veg-filter] .active');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const vegMode = activeVeg ? activeVeg.dataset.vegValue : 'all';
  document.querySelectorAll('.menu-tabs-layout [data-menu-item], .menu-accordion-layout [data-menu-item]').forEach((item) => {
    const matchesSearch = item.dataset.name.includes(query);
    const matchesVeg = vegMode === 'all' || item.dataset.veg === vegMode;
    item.hidden = !matchesSearch || !matchesVeg;
  });
  renderMenuSearchResults(query, vegMode);
}

const menuSearchInput = document.querySelector('[data-menu-search]');
if (menuSearchInput) menuSearchInput.addEventListener('input', applyMenuFilters);

const vegFilter = document.querySelector('[data-veg-filter]');
if (vegFilter) vegFilter.addEventListener('click', (event) => {
  const button = event.target.closest('[data-veg-value]');
  if (!button) return;

  document.querySelectorAll('[data-veg-filter] [data-veg-value]').forEach((node) => {
    node.classList.toggle('active', node === button);
  });
  applyMenuFilters();
});

function syncPaymentBox() {
  const box = document.querySelector('[data-payment-box]');
  const paymentMethod = document.querySelector('[data-payment-method]');
  const method = paymentMethod ? paymentMethod.value : 'UPI';
  if (box) box.hidden = method !== 'UPI';
}

const paymentMethodSelect = document.querySelector('[data-payment-method]');
if (paymentMethodSelect) paymentMethodSelect.addEventListener('change', syncPaymentBox);

function syncDateGroup(group) {
  const daySelect = group.querySelector('[data-date-day]');
  const monthSelect = group.querySelector('[data-date-month]');
  const yearSelect = group.querySelector('[data-date-year]');
  const day = daySelect && daySelect.value;
  const month = monthSelect && monthSelect.value;
  const year = yearSelect && yearSelect.value;
  const target = group.querySelector('[data-date-value]');
  if (!target) return;

  target.value = day && month && year
    ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    : '';
}

function bindDateGroup(group) {
  group.addEventListener('change', () => syncDateGroup(group));
  syncDateGroup(group);
}

document.querySelectorAll('[data-date-group]').forEach(bindDateGroup);

function formatDateValue(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function dateSelectGroupHtml(key, label, value) {
  const parts = formatDateValue(value).split('-');
  const year = parts[0] || '';
  const month = parts[1] ? String(Number(parts[1])) : '';
  const day = parts[2] ? String(Number(parts[2])) : '';
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= 1920; y--) years.push(y);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const option = (val, text, selected) => `<option value="${val}"${selected ? ' selected' : ''}>${text}</option>`;
  return `
    <fieldset class="date-select-group" data-date-group="${escapeHtml(key)}">
      <legend>${escapeHtml(label)}</legend>
      <input type="hidden" name="${escapeHtml(key)}" data-date-value>
      <select data-date-day aria-label="${escapeHtml(label)} day">${option('', 'Day', !day)}${days.map((d) => option(d, d, String(d) === day)).join('')}</select>
      <select data-date-month aria-label="${escapeHtml(label)} month">${option('', 'Month', !month)}${monthNames.map((m, i) => option(i + 1, m, String(i + 1) === month)).join('')}</select>
      <select data-date-year aria-label="${escapeHtml(label)} year">${option('', 'Year', !year)}${years.map((y) => option(y, y, String(y) === year)).join('')}</select>
    </fieldset>
  `;
}

function specialDayFieldsHtml(customer) {
  const info = customer || {};
  return `
    <div class="special-day-fields">
      <p><strong>Your special day deserves more than just wishes!</strong><br><span>Let us know your birthday and get a personalized surprise from us.</span></p>
      <div class="form-row">
        ${dateSelectGroupHtml('birthday', 'Birthday Date', info.birthday)}
      </div>
      <button class="btn primary full" type="submit" data-special-day-save>Save My Birthday</button>
      <p class="special-day-status" data-special-day-status></p>
    </div>
  `;
}

let orderStatusPollTimer = null;
let orderCountdownTimer = null;
let latestOrderStatus = null;

function clearOrderStatusTimers() {
  if (orderStatusPollTimer) {
    clearInterval(orderStatusPollTimer);
    orderStatusPollTimer = null;
  }
  if (orderCountdownTimer) {
    clearInterval(orderCountdownTimer);
    orderCountdownTimer = null;
  }
}

function statusMessage(status) {
  if (!status) return 'Waiting for kitchen confirmation.';
  if (status.statusLabel === 'CONFIRMED') return 'Order confirmed. The kitchen will start preparation shortly.';
  if (status.statusLabel === 'PREPARING') return 'Food is getting ready.';
  if (status.statusLabel === 'READY') return 'Your food is ready.';
  if (status.statusLabel === 'DELIVERED') return 'Delivered. Thank you for ordering from Manisha\'s Kitchen.';
  if (status.statusLabel === 'CANCELLED') return 'This order was cancelled.';
  return 'Waiting for kitchen confirmation.';
}

function shortTime(value) {
  return formatIstTime(value);
}

function orderStepText(step, status) {
  const label = status && status.statusLabel || 'PENDING';
  if (step === 'CONFIRMED') {
    if (label === 'PENDING') return 'Waiting for kitchen confirmation.';
    if (status && status.confirmedAt) return `Confirmed at ${shortTime(status.confirmedAt)}.`;
    return 'Order confirmed.';
  }
  if (step === 'PREPARING') {
    if (label === 'PENDING' || label === 'CONFIRMED') return 'Preparation time will show here.';
    if (label === 'PREPARING' && status && status.preparationEndsAt) {
      const remaining = new Date(status.preparationEndsAt).getTime() - Date.now();
      return remaining > 0
        ? `Preparation time: ${status.preparationMinutes || '-'} min. Ready in ${formatCountdown(remaining)}.`
        : 'Estimated ready any moment now.';
    }
    if (label === 'READY' || label === 'DELIVERED') return 'Preparation complete. Food is ready.';
    return 'Preparation not active.';
  }
  if (step === 'DELIVERED') {
    if (label === 'DELIVERED') return status && status.deliveredAt ? `Delivered at ${shortTime(status.deliveredAt)}.` : 'Delivered.';
    if (label === 'CANCELLED') return 'Order cancelled.';
    return 'Delivery pending.';
  }
  return '';
}

function updateOrderStatusSteps(status) {
  const label = status && status.statusLabel || 'PENDING';
  const completedByLabel = {
    PENDING: [],
    CONFIRMED: ['CONFIRMED'],
    PREPARING: ['CONFIRMED'],
    READY: ['CONFIRMED', 'PREPARING'],
    DELIVERED: ['CONFIRMED', 'PREPARING', 'DELIVERED'],
    CANCELLED: [],
  };
  const activeByLabel = {
    PENDING: 'CONFIRMED',
    CONFIRMED: 'PREPARING',
    PREPARING: 'PREPARING',
    READY: 'DELIVERED',
    DELIVERED: 'DELIVERED',
    CANCELLED: '',
  };
  const completeSteps = completedByLabel[label] || [];
  const activeStep = activeByLabel[label] || '';

  document.querySelectorAll('[data-order-step]').forEach((step) => {
    const key = step.dataset.orderStep;
    step.classList.toggle('complete', completeSteps.includes(key));
    step.classList.toggle('active', key === activeStep);
    step.classList.toggle('cancelled', label === 'CANCELLED');
  });
  document.querySelectorAll('[data-order-step-text]').forEach((node) => {
    node.textContent = orderStepText(node.dataset.orderStepText, status);
  });
}

function updateOrderStatusPanel(status) {
  latestOrderStatus = status;
  const label = document.querySelector('[data-order-status-label]');
  const message = document.querySelector('[data-order-status-message]');
  const countdown = document.querySelector('[data-order-countdown]');
  const updated = document.querySelector('[data-order-status-updated]');
  if (!label || !message || !countdown) return;

  label.textContent = status && status.statusLabel || 'PENDING';
  label.dataset.status = status && status.statusLabel || 'PENDING';
  message.textContent = statusMessage(status);
  updateOrderStatusSteps(status);
  if (updated) {
    updated.textContent = status
      ? `Updated ${formatIstTime(new Date())} IST`
      : 'Checking status...';
  }

  if (status && status.statusLabel === 'PREPARING' && status.preparationEndsAt) {
    const remaining = new Date(status.preparationEndsAt).getTime() - Date.now();
    countdown.hidden = false;
    countdown.textContent = remaining > 0
      ? `Estimated ready in ${formatCountdown(remaining)}`
      : 'Estimated ready any moment now';
    return;
  }

  countdown.hidden = true;
  countdown.textContent = '';
}

async function fetchOrderStatus(session) {
  if (!session || !session.orderNumber || !session.token) return;
  try {
    const params = new URLSearchParams({ token: session.token });
    const response = await fetch(apiUrl(`/orders/${encodeURIComponent(session.orderNumber)}/status?${params.toString()}`), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 404) {
        localStorage.removeItem(ORDER_SESSION_KEY);
        clearOrderStatusTimers();
      }
      return;
    }
    updateOrderStatusPanel(await response.json());
  } catch {
    // Keep the current visible status; the next poll will retry.
  }
}

function startOrderStatusTracking(session) {
  clearOrderStatusTimers();
  updateOrderStatusPanel(null);
  fetchOrderStatus(session);
  orderStatusPollTimer = setInterval(() => fetchOrderStatus(session), 5000);
  orderCountdownTimer = setInterval(() => {
    if (latestOrderStatus) updateOrderStatusPanel(latestOrderStatus);
  }, 1000);
}

function showStaticOrderThankYou({ order, total, amount, paymentMethod, whatsappUrl, session }) {
  const section = document.querySelector('.checkout-page .section.compact');
  if (!section) return;

  const orderNumber = order.orderNumber || order.order_number || '';
  const receivedAt = formatIstDateTime(order.createdAt || order.created_at || new Date());
  const paymentAmount = Number(amount || parseMoney(total));
  const cashbackEarned = Number(order.cashbackEarned || (paymentAmount * 0.10) || 0);
  const cashbackRedeemed = Number(order.cashbackRedeemed || 0);
  const shouldShowUpi = String(paymentMethod || 'UPI').toUpperCase() === 'UPI';
  const auth = getCustomerAuth();
  const customer = (auth && auth.customer) || {};
  const referralCode = String(order.customerReferralCode || order.referralCode || (auth && auth.customer && auth.customer.referralCode) || '').trim().toUpperCase();
  const shareUrl = pageUrl('menu.html');
  const shareText = `Order from Manisha's Kitchen and get 5% off your first order with my referral code\n\n${referralCode}\n\nVisit - ${shareUrl}`;
  section.innerHTML = `
    <div class="success-panel checkout-thank-you">
      <h1>Thank you for your order!</h1>
      <p>Your order has been received.</p>
      <p class="order-received-at">Received: ${escapeHtml(receivedAt)} IST</p>
      <div class="thank-you-total">
        <span>Total Amount</span>
        <strong>${escapeHtml(total)}</strong>
      </div>
      ${shouldShowUpi ? `
        <div class="payment-box thank-you-payment">
          <h2>Pay with UPI</h2>
          <p>Choose your preferred UPI app. When you return, this thank-you page and order status will still be here.</p>
          <div data-upi-payment data-locked="1">
            ${upiProviderButtons()}
          </div>
          <p>UPI ID: <a href="upi://pay?pa=manishaskitchen2026@okaxis" data-upi-link><strong>manishaskitchen2026@okaxis</strong></a></p>
          <p>Order ID: <strong>${escapeHtml(orderNumber)}</strong></p>
        </div>
      ` : `
        <div class="payment-box thank-you-payment">
          <p>Payment method: <strong>Cash</strong></p>
          <p>Order ID: <strong>${escapeHtml(orderNumber)}</strong></p>
        </div>
      `}
      <div class="cashback-earned-card">
        <span>Cashback for next order</span>
        <strong>${money(cashbackEarned)}</strong>
          <p>Cashback from the eligible food bill will be added to your mobile wallet after the order is confirmed.</p>
        ${cashbackRedeemed > 0 ? `<small>You redeemed ${money(cashbackRedeemed)} on this order.</small>` : ''}
      </div>
      <form class="special-day-save-form" data-special-day-save-form>
        ${specialDayFieldsHtml(customer)}
      </form>
      ${referralCode ? `
        <div class="referral-share-card" data-referral-share-card>
          <h2>Refer &amp; earn cashback</h2>
          <p>Share your code with friends. They get 5% off their first order, and you earn 5% cashback on their bill.</p>
          <div class="referral-code-box">
            <strong data-referral-code-value>${escapeHtml(referralCode)}</strong>
            <button type="button" class="btn secondary" data-copy-referral>Copy</button>
          </div>
          <a class="btn primary" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">Share on WhatsApp</a>
          <p class="referral-copied" data-referral-copied hidden>Copied!</p>
        </div>
      ` : ''}
      <div class="order-status-card">
        <span class="status-pill" data-order-status-label data-status="PENDING">PENDING</span>
        <strong data-order-status-message>Waiting for kitchen confirmation.</strong>
        <span class="order-countdown" data-order-countdown hidden></span>
        <div class="order-status-steps" aria-label="Order status">
          <div class="order-status-step active" data-order-step="CONFIRMED">
            <span>1</span>
            <strong>Confirmation</strong>
            <small data-order-step-text="CONFIRMED">Waiting for kitchen confirmation.</small>
          </div>
          <div class="order-status-step" data-order-step="PREPARING">
            <span>2</span>
            <strong>Preparation</strong>
            <small data-order-step-text="PREPARING">Preparation time will show here.</small>
          </div>
          <div class="order-status-step" data-order-step="DELIVERED">
            <span>3</span>
            <strong>Delivered</strong>
            <small data-order-step-text="DELIVERED">Delivery pending.</small>
          </div>
        </div>
        <span class="order-status-meta" data-order-status-updated>Checking status...</span>
      </div>
      <a class="btn secondary" href="${pageUrl('menu.html')}">Back to Menu</a>
    </div>
  `;

  window.scrollTo(0, 0);
  section.querySelectorAll('[data-date-group]').forEach(bindDateGroup);
  if (session) startOrderStatusTracking(session);
}

function restoreStaticOrderSession() {
  const section = document.querySelector('.checkout-page .section.compact');
  if (!section || getCart().length) return;

  const session = getActiveOrderSession();
  if (!session) return;

  showStaticOrderThankYou({
    order: {
      orderNumber: session.orderNumber,
      cashbackEarned: session.cashbackEarned || 0,
      cashbackRedeemed: session.cashbackRedeemed || 0,
      customerReferralCode: session.referralCode || '',
    },
    total: session.total || 'Rs. 0.00',
    amount: session.amount || parseMoney(session.total),
    paymentMethod: session.paymentMethod || 'UPI',
    whatsappUrl: session.whatsappUrl || pageUrl('menu.html'),
    session,
  });
}

const checkoutForm = document.querySelector('[data-checkout-form]');
if (checkoutForm) checkoutForm.addEventListener('submit', async (event) => {
  const cartJsonNode = document.querySelector('[data-cart-json]');
  const cartJson = cartJsonNode ? cartJsonNode.value : '[]';
  const cart = JSON.parse(cartJson);
  if (!cart.length) {
    event.preventDefault();
    alert('Your cart is empty.');
    return;
  }

  const form = event.target;
  if (form && form.hasAttribute('data-static-checkout')) {
    event.preventDefault();
    const customerAuth = getCustomerAuth();
    if (!customerAuth) {
      alert('Please log in with your mobile OTP before booking an order.');
      document.querySelector('[data-cashback-panel]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton && submitButton.textContent || 'Book Order';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Placing Order...';
    }

    const formData = new FormData(form);
    const subtotalNode = document.querySelector('[data-checkout-subtotal]');
    const gstNode = document.querySelector('[data-checkout-gst]');
    const discountNode = document.querySelector('[data-checkout-discount]');
    const deliveryNode = document.querySelector('[data-checkout-delivery]');
    const cashbackNode = document.querySelector('[data-checkout-cashback]');
    const checkoutTotalNode = document.querySelector('[data-checkout-total]');
    const subtotal = parseMoney(subtotalNode && subtotalNode.textContent);
    const gstAmount = parseMoney(gstNode && gstNode.textContent);
    const regularDiscountAmount = parseMoney(discountNode && discountNode.textContent);
    const studentDiscountNode = document.querySelector('[data-student-discount]');
    const studentDiscountAmount = parseMoney(studentDiscountNode && studentDiscountNode.textContent);
    const discountAmount = regularDiscountAmount + studentDiscountAmount;
    const deliveryAmount = parseMoney(deliveryNode && deliveryNode.textContent);
    const cashbackRedeemAmount = parseMoney(cashbackNode && cashbackNode.textContent);
    const grandTotal = parseMoney(checkoutTotalNode && checkoutTotalNode.textContent);
    const total = checkoutTotalNode && checkoutTotalNode.textContent || money(grandTotal);
    const items = cart.map((item) => `${item.name} x ${item.quantity}`).join(', ');
    const walletPanel = document.querySelector('[data-cashback-panel]');
    const walletNumberInput = walletPanel && walletPanel.querySelector('[data-wallet-number]');
    const walletNameInput = walletPanel && walletPanel.querySelector('[name="customer_name"]');
    const authCustomer = (customerAuth && customerAuth.customer) || {};
    const number = String(authCustomer.mobileNumber || (walletNumberInput && walletNumberInput.value) || '').replace(/\D+/g, '');
    const normalizedNumber = number.length === 10 ? `91${number}` : number;
    const customerName = String(authCustomer.name || (walletNameInput && walletNameInput.value) || '').trim();
    if (!customerName || !number) {
      alert('Please enter your name and mobile number in the Cashback Wallet section above (switch to "New User" if you have not logged in) to continue.');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
      return;
    }
    const isHomeDelivery = getDeliveryType() === 'home_delivery';
    const locality = getSelectedLocality();
    const sector = getSelectedSector();
    const customLocation = getCustomLocation();
    const address = isHomeDelivery
      ? String((document.querySelector('[name="address"]') || {}).value || '').trim() || null
      : null;
    const deliveryAddress = isHomeDelivery && address
      ? [address, ...deliveryLocationLines(locality, sector, customLocation)].join('\n')
      : null;
    const selectedAddressLabel = String((document.querySelector('[name="address_label"]') || {}).value || 'Home').trim();
    const customAddressLabel = String((document.querySelector('[name="custom_address_label"]') || {}).value || '').trim();
    const addressLabel = selectedAddressLabel === 'Custom' ? customAddressLabel : selectedAddressLabel;
    const shouldSaveAddress = isHomeDelivery && Boolean((document.querySelector('[name="save_address"]') || {}).checked);
    if (isHomeDelivery && !address) {
      alert('Please enter your delivery address for Home Delivery.');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
      return;
    }
    if (isHomeDelivery && (!locality || (locality === 'koparkhairne' && !sector) || (locality === 'other' && !customLocation))) {
      alert('Please select your delivery locality and complete the location details.');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
      return;
    }
    if (shouldSaveAddress && (!address || !addressLabel)) {
      alert('Enter both an address title and delivery address before saving.');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
      return;
    }
    if (shouldSaveAddress && !customerAuth) {
      alert('Please log in to save an address to your account.');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
      return;
    }
    const orderPayload = {
      customerName,
      mobileNumber: number,
      whatsappNumber: number,
      address: deliveryAddress,
      studentInstitution: studentDiscountDetails().eligible ? studentDiscountDetails().institution : null,
      studentGrade: studentDiscountDetails().eligible ? studentDiscountDetails().grade : null,
      referralCode: appliedReferralCode() || null,
      orderType: isHomeDelivery ? 'DELIVERY' : 'DINE_IN',
      paymentMethod: formData.get('payment_method') || 'UPI',
      totalAmount: subtotal,
      gstAmount,
      discountAmount,
      deliveryAmount,
      cashbackRedeemAmount,
      customerAuthToken: customerAuth ? customerAuth.token : '',
      grandTotal,
      items: cart.map((item) => ({
        foodItemId: Number(item.id),
        name: item.name,
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.price || 0),
        subtotal: Number(item.price || 0) * Number(item.quantity || 1),
      })),
    };

    try {
      if (shouldSaveAddress) {
        const saveAddressResponse = await fetch(apiUrl('/customer/addresses'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${customerAuth.token}`,
          },
          body: JSON.stringify({ label: addressLabel, address }),
        });
        const savedAddressResult = await saveAddressResponse.json().catch(() => ({}));
        if (!saveAddressResponse.ok) throw new Error(savedAddressResult.error || 'Could not save the address.');
        saveCustomerAuth({ token: customerAuth.token, expiresAt: customerAuth.expiresAt, customer: savedAddressResult.customer, transactions: savedAddressResult.transactions || [] });
      }
      const response = await fetch(apiUrl('/orders'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${customerAuth.token}`,
        },
        body: JSON.stringify(orderPayload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Failed to place order.');
      }

      const orderNumber = result.orderNumber || result.order_number || `ORD-${Date.now()}`;
      const whatsappUrl = `https://wa.me/${normalizedNumber}?text=${encodeURIComponent([
        'Order Confirmed!',
        `Order ID: ${orderNumber}`,
        `Customer: ${orderPayload.customerName}`,
        `Items: ${items}`,
        `Total: ${total}`,
        '',
        "Thank you for ordering from Manisha's Kitchen.",
      ].join('\n'))}`;
      const session = result.customerSessionToken && result.customerSessionExpiresAt
        ? {
          orderNumber,
          token: result.customerSessionToken,
          expiresAt: result.customerSessionExpiresAt,
          total,
          amount: grandTotal,
          paymentMethod: orderPayload.paymentMethod,
          whatsappUrl,
          referralCode: result.customerReferralCode || '',
          cashbackEarned: result.cashbackEarned || 0,
          cashbackRedeemed: result.cashbackRedeemed || 0,
        }
        : null;

      clearCartStorage();
      localStorage.removeItem(CASHBACK_REDEEM_KEY);
      localStorage.removeItem(CASHBACK_REFERRAL_KEY);
      if (session) saveOrderSession(session);
      updateCartCount();
      showStaticOrderThankYou({
        order: result,
        total,
        amount: grandTotal,
        paymentMethod: orderPayload.paymentMethod,
        whatsappUrl,
        session,
      });
      refreshCustomerWallet().catch(() => {});
    } catch (error) {
      alert(error.message || 'Failed to place order. Please try again.');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    }
  }
});

document.querySelectorAll('[data-availability-form]').forEach((form) => {
  const checkbox = form.querySelector('input[type="checkbox"]');
  const value = form.querySelector('[data-availability-value]');
  const label = form.querySelector('strong');
  if (!checkbox || !value || !label) return;

  checkbox.addEventListener('change', async () => {
    const previous = !checkbox.checked;
    value.value = checkbox.checked ? '1' : '0';
    checkbox.disabled = true;
    const actionUrl = new URL(form.getAttribute('action') || window.location.href, window.location.href).href;

    try {
      const response = await fetch(actionUrl, {
        method: 'POST',
        body: new FormData(form),
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'fetch',
        },
      });
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        const preview = responseText.replace(/\s+/g, ' ').trim().slice(0, 80);
        throw new Error(response.redirected ? 'Your admin session expired. Please log in again.' : `The server returned an unexpected response: ${preview || response.status}`);
      }
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Could not update availability.');
      }

      checkbox.checked = result.is_available;
      value.value = result.is_available ? '1' : '0';
      label.textContent = result.label;
      label.classList.toggle('ok', result.is_available);
      label.classList.toggle('bad', !result.is_available);
    } catch (error) {
      checkbox.checked = previous;
      value.value = previous ? '1' : '0';
      alert(error.message || 'Could not update availability.');
    } finally {
      checkbox.disabled = false;
    }
  });
});

const success = document.querySelector('[data-clear-cart]');
if (success) {
  clearCartStorage();
  const url = success.dataset.whatsapp;
  if (url) {
    setTimeout(() => window.open(url, '_blank'), 800);
  }
}

document.addEventListener('input', (event) => {
  if (event.target.closest('[data-student-institution], [data-student-grade]')) {
    renderCheckout();
  }
  if (event.target.closest('[name="delivery_type"], [data-locality], [data-sector], [data-custom-location]')) {
    renderCheckout();
  }
  const walletNumber = event.target.closest('[data-wallet-number]');
  if (walletNumber) {
    try {
      localStorage.setItem(CASHBACK_NUMBER_KEY, walletNumber.value);
    } catch {
      // ignore storage errors
    }
  }
  const walletName = event.target.closest('[data-cashback-panel] [name="customer_name"]');
  if (walletName) {
    try {
      localStorage.setItem(CASHBACK_NAME_KEY, walletName.value);
    } catch {
      // ignore storage errors
    }
  }
});

function syncStudentDiscountFields() {
  const toggle = document.querySelector('[data-student-discount-toggle]');
  if (!toggle) return;

  const isSelected = toggle.checked;
  document.querySelectorAll('[data-student-discount-details], [data-student-discount-note]').forEach((node) => {
    node.hidden = !isSelected;
  });
  toggle.setAttribute('aria-expanded', isSelected ? 'true' : 'false');
}

document.addEventListener('change', (event) => {
  if (!event.target.closest('[data-student-discount-toggle]')) return;
  syncStudentDiscountFields();
  renderCheckout();
});

function initDeliveryFields() {
  const deliveryTypeField = document.querySelector('.delivery-type-field');
  const deliveryLocationField = document.querySelector('[data-delivery-location-field]');
  const deliveryAddressField = document.querySelector('[data-delivery-address-field]');
  const localitySelect = document.querySelector('[data-locality]');
  const sectorField = document.querySelector('[data-sector-field]');
  const customLocationField = document.querySelector('[data-custom-location-field]');
  const sectorSelect = document.querySelector('[data-sector]');

  if (!deliveryTypeField || !deliveryLocationField || !localitySelect) return;

  // Populate sector dropdown
  if (sectorSelect && sectorSelect.options.length <= 1) {
    for (let i = 1; i <= 26; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `Sector ${i}`;
      sectorSelect.appendChild(option);
    }
  }

  function updateVisibility() {
    const deliveryType = getDeliveryType();
    const isHomeDelivery = deliveryType === 'home_delivery';
    deliveryLocationField.hidden = !isHomeDelivery;
    if (deliveryAddressField) deliveryAddressField.hidden = !isHomeDelivery;

    const locality = getSelectedLocality();
    sectorField.hidden = locality !== 'koparkhairne';
    customLocationField.hidden = locality !== 'other';

    // Clear sector when locality changes
    if (locality !== 'koparkhairne' && sectorSelect) {
      sectorSelect.value = '';
    }
    // Clear custom location when locality changes
    if (locality !== 'other') {
      const customInput = document.querySelector('[data-custom-location]');
      if (customInput) customInput.value = '';
    }
  }

  // Initial update
  updateVisibility();

  // Add event listeners
  document.querySelectorAll('[name="delivery_type"]').forEach((radio) => {
    radio.addEventListener('change', updateVisibility);
  });

  localitySelect.addEventListener('change', updateVisibility);
}

// Initialize delivery fields
initDeliveryFields();
syncStudentDiscountFields();

initAboutParallax();
ensureMenuSearchResults();
renderCartControls();
renderCheckout();
renderReferralState();
loadCustomerAccount();
updateCartCount();
syncPaymentBox();
applyMenuFilters();
restoreStaticOrderSession();
syncMenuFromDatabase();
showIndependenceBannerPopup();
renderCheckout();

// Browsers restore a page from the back/forward cache without re-running scripts,
// so a stale cart badge/count can linger after the cart changed on another page
// (e.g. an order was just placed) and the user navigates back with the Back button.
window.addEventListener('pageshow', () => {
  renderCartControls();
  renderCheckout();
  updateCartCount();
  restoreStaticOrderSession();
});

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  renderCartControls();
  renderCheckout();
  updateCartCount();
});
