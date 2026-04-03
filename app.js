'use strict';

/* ── Storage Keys ── */
const KEYS = {
  interval: 'water_interval_min',
  active:   'water_is_active',
  nextTime: 'water_next_time',
  count:    'water_count_today',
  date:     'water_count_date',
  wake:     'water_wake_min',
  sleep:    'water_sleep_min',
  sub:      'water_push_sub',
};

/* ── Defaults ── */
const DEFAULTS = {
  interval: 60,
  wake: 420,    // 07:00 (Inactive Start)
  sleep: 1410,  // 23:30 (Inactive End)
};

/* ── State ── */
let state = {
  interval: parseInt(localStorage.getItem(KEYS.interval)) || DEFAULTS.interval,
  active:   localStorage.getItem(KEYS.active) === 'true',
  wakeMin:  parseInt(localStorage.getItem(KEYS.wake))  || DEFAULTS.wake,
  sleepMin: parseInt(localStorage.getItem(KEYS.sleep)) || DEFAULTS.sleep,
  nextTime: localStorage.getItem(KEYS.nextTime) ? new Date(localStorage.getItem(KEYS.nextTime)) : null,
  count:    0,
};

let swReg = null;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  initCount();
  buildSelects();
  renderAll();
  await registerSW();
  checkURLParams();
  requestIdleCallback(() => checkInstallHint());
});

/* ── Service Worker ── */
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('/sw.js');
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'DRINK_LOGGED') logDrink();
    });
  } catch(err) { console.warn('SW registration failed:', err); }
}

/* ── URL Params ── */
function checkURLParams() {
  const params = new URLSearchParams(location.search);
  if (params.get('drink') === '1') {
    logDrink();
    history.replaceState({}, '', '/');
  }
}

/* ── Count (with daily reset) ── */
function initCount() {
  const today = new Date().toISOString().slice(0, 10);
  const savedDate = localStorage.getItem(KEYS.date);
  if (savedDate !== today) {
    localStorage.setItem(KEYS.date, today);
    localStorage.setItem(KEYS.count, '0');
  }
  state.count = parseInt(localStorage.getItem(KEYS.count)) || 0;
}

function logDrink() {
  state.count++;
  localStorage.setItem(KEYS.count, String(state.count));
  updateStats();
  showToast('물 마셨어요! 💧');
}

/* ── Select Options ── */
function buildSelects() {
  const wakeEl = document.getElementById('wakeSelect');
  const sleepEl = document.getElementById('sleepSelect');

  const options = [];
  for (let min = 0; min <= 1440; min += 30) {
    let label = '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (min === 0) label = '오전 12:00 (자정)';
    else if (min === 720) label = '오후 12:00 (정오)';
    else if (min === 1440) label = '오전 12:00 (자정)';
    else {
      const ampm = h < 12 ? '오전' : '오후';
      let hh = h % 12; if (hh === 0) hh = 12;
      label = `${ampm} ${hh}:${String(m).padStart(2, '0')}`;
    }
    options.push([min, label]);
  }

  options.forEach(([min, label]) => {
    const opt1 = document.createElement('option');
    opt1.value = min; opt1.textContent = label;
    wakeEl.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = min; opt2.textContent = label;
    sleepEl.appendChild(opt2);
  });

  // Explicitly set values after appending
  wakeEl.value = state.wakeMin;
  sleepEl.value = state.sleepMin;

  wakeEl.addEventListener('change', () => {
    state.wakeMin = parseInt(wakeEl.value);
    localStorage.setItem(KEYS.wake, state.wakeMin);
    if (state.active) scheduleNext();
    updateTimeline();
    updateStats();
  });
  sleepEl.addEventListener('change', () => {
    state.sleepMin = parseInt(sleepEl.value);
    localStorage.setItem(KEYS.sleep, state.sleepMin);
    if (state.active) scheduleNext();
    updateTimeline();
    updateStats();
  });

  const picker = document.getElementById('intervalPicker');
  picker.addEventListener('scroll', () => {
    clearTimeout(picker._timer);
    picker._timer = setTimeout(() => updateFromPicker(), 150);
  });
  
  const testBtn = document.getElementById('testPushBtn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = '5초 대기 중... 홈 화면으로 나가보세요!';
      if ('Notification' in window && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }
      setTimeout(() => {
        triggerTestNotification();
        testBtn.disabled = false;
        testBtn.textContent = '🔔 알림 테스트 (5초 후)';
      }, 5000);
    });
  }

  setTimeout(() => syncPickerToValue(), 100);
}

function updateFromPicker() {
  const picker = document.getElementById('intervalPicker');
  const items = picker.querySelectorAll('.picker-item');
  const center = picker.scrollTop + 60;
  let closest = items[0];
  let minDiff = 9999;
  
  items.forEach(item => {
    const diff = Math.abs(item.offsetTop + 20 - center);
    if (diff < minDiff) { minDiff = diff; closest = item; }
    item.classList.remove('selected');
  });
  
  closest.classList.add('selected');
  const val = parseInt(closest.dataset.val);
  if (state.interval !== val) {
    state.interval = val;
    localStorage.setItem(KEYS.interval, state.interval);
    if (state.active) scheduleNext();
    updateIntervalDisplay();
  }
}

function syncPickerToValue() {
  const picker = document.getElementById('intervalPicker');
  const items = picker.querySelectorAll('.picker-item');
  items.forEach(item => {
    if (parseInt(item.dataset.val) === state.interval) {
      picker.scrollTop = item.offsetTop - 40;
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

function triggerTestNotification() {
  const title = '물 마실 시간이에요!';
  if (swReg?.active) {
    swReg.active.showNotification(title, {
      body: '알림 테스트입니다. 정상적으로 작동하고 있어요!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'test-push',
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: '테스트 알림입니다.',
      icon: '/icon-192.png',
    });
  }
}

/* ── Render All ── */
function renderAll() {
  updateStatus();
  updateStats();
  updateTimeline();
  updateIntervalDisplay();
  updateToggleBtn();
}

/* ── Status Pill ── */
function updateStatus() {
  const pill = document.getElementById('statusPill');
  if (state.active) {
    pill.textContent = '활성중';
    pill.className = 'status-pill active';
  } else {
    pill.textContent = '꺼짐';
    pill.className = 'status-pill inactive';
  }
}

/* ── Stats ── */
function updateStats() {
  document.getElementById('todayCount').textContent = state.count;
  const inH = calcInactiveHours();
  const maxC = calcMaxCount();
  document.getElementById('inactiveHoursEl').textContent = inH.toFixed(1) + 'h';
  document.getElementById('maxCountEl').textContent = maxC;
}

/* ── Timeline ── */
function updateTimeline() {
  const w = state.wakeMin, s = state.sleepMin;
  const total = 1440;
  const bar = document.querySelector('.timeline-bar');
  if (!bar) return;
  bar.innerHTML = '';

  if (s > w) {
    addTlSegment(bar, 0, w / total * 100, 'active');
    addTlSegment(bar, w / total * 100, (s - w) / total * 100, 'sleep');
    addTlSegment(bar, s / total * 100, (total - s) / total * 100, 'active');
  } else {
    addTlSegment(bar, 0, s / total * 100, 'sleep');
    addTlSegment(bar, s / total * 100, (w - s) / total * 100, 'active');
    addTlSegment(bar, w / total * 100, (total - w) / total * 100, 'sleep');
  }

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nowPct = nowMin / total * 100;
  const nowEl = document.createElement('div');
  nowEl.className = 'tl-now';
  nowEl.style.left = nowPct + '%';
  bar.appendChild(nowEl);
}

function addTlSegment(bar, left, width, type) {
  if (width <= 0) return;
  const el = document.createElement('div');
  el.className = `tl-${type}`;
  el.style.left = left + '%';
  el.style.width = width + '%';
  bar.appendChild(el);
}

/* ── Interval Display ── */
function updateIntervalDisplay() {
  const min = state.interval;
  const el = document.getElementById('intervalVal');
  if (el) el.textContent = min;
  const sub = document.getElementById('intervalSub');
  if (sub) sub.textContent = '하루 ' + calcMaxCount() + '회 예상';
}

/* ── Toggle ── */
function updateToggleBtn() {
  const btn = document.getElementById('toggleBtn');
  if (!btn) return;
  if (state.active) {
    btn.textContent = '알림 끄기';
    btn.className = 'toggle-btn active';
  } else {
    btn.textContent = '알림 시작하기';
    btn.className = 'toggle-btn inactive';
  }
}

window.toggleAlarm = async function() {
  if (!state.active) {
    const granted = await requestNotificationPermission();
    if (!granted) {
      document.getElementById('permBanner').classList.add('show');
      return;
    }
    document.getElementById('permBanner').classList.remove('show');
    state.active = true;
    scheduleNext();
  } else {
    state.active = false;
    state.nextTime = null;
    localStorage.removeItem(KEYS.nextTime);
  }
  localStorage.setItem(KEYS.active, state.active);
  updateStatus();
  updateToggleBtn();
};

/* ── Notification Permission ── */
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/* ── Schedule Next ── */
function scheduleNext() {
  const now = new Date();
  const nextTime = new Date(now.getTime() + state.interval * 60 * 1000);
  state.nextTime = nextTime;
  localStorage.setItem(KEYS.nextTime, nextTime.toISOString());

  if (swReg?.active) {
    swReg.active.postMessage({
      type: 'SCHEDULE',
      interval: state.interval,
      wakeMin: state.wakeMin,
      sleepMin: state.sleepMin,
    });
  }
  subscribeAndSendToServer();
}

/* ── Push Subscription ── */
async function subscribeAndSendToServer() {
  if (!swReg) return;
  try {
    const VAPID_PUBLIC_KEY = window.VAPID_PUBLIC_KEY || '';
    if (!VAPID_PUBLIC_KEY) return;
    let sub = await swReg.pushManager.getSubscription();
    if (!sub) {
      sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    localStorage.setItem(KEYS.sub, JSON.stringify(sub));
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub,
        interval: state.interval,
        wakeMin: state.wakeMin,
        sleepMin: state.sleepMin,
      }),
    });
  } catch(e) { console.warn('Push subscription failed:', e); }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function isInActiveWindow() {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = state.wakeMin, end = state.sleepMin;
  const isInactive = end > start ? (cur >= start && cur < end) : (cur >= start || cur < end);
  return !isInactive;
}

function triggerLocalNotification() {
  if (!isInActiveWindow()) return;
  const title = '물 마실 시간이에요!';
  const body = '지금 물 한 잔 마셔요. 건강한 하루를 위해!';
  if (swReg?.active) {
    swReg.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'water-reminder',
      renotify: true,
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body: body,
      icon: '/icon-192.png',
      tag: 'water-reminder',
    });
  }
}

function calcInactiveHours() {
  const start = state.wakeMin, end = state.sleepMin;
  const inactiveMin = end > start ? end - start : (1440 - start) + end;
  return inactiveMin / 60;
}

function calcActiveHours() {
  return 24 - calcInactiveHours();
}

function calcMaxCount() {
  const ah = calcActiveHours();
  return Math.floor(ah / (state.interval / 60));
}

function showToast(msg) {
  const toast = document.getElementById('drinkToast');
  if (toast) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }
}

function checkInstallHint() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone;
  const el = document.getElementById('installHint');
  if (isIOS && !isStandalone && el) {
    el.classList.add('show');
  }
}
