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
  wake: 420,    // 07:00 (Active Start)
  sleep: 1320,  // 22:00 (Active End)
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
let currentModalTarget = null; // 'wake' or 'sleep'

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  initCount();
  initUI();
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

/* ── Count ── */
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

/* ── UI Logic ── */
function initUI() {
  // Modal toggle
  document.getElementById('wakeBtn').addEventListener('click', () => openModal('wake'));
  document.getElementById('sleepBtn').addEventListener('click', () => openModal('sleep'));

  // Interval picker
  const picker = document.getElementById('intervalPicker');
  picker.addEventListener('scroll', () => {
    clearTimeout(picker._timer);
    picker._timer = setTimeout(() => updateFromPicker(), 150);
  });
  
  // Test Link
  const testBtn = document.getElementById('testPushBtn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      testBtn.textContent = '5초 후 알림 발송...';
      if ('Notification' in window && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }
      setTimeout(() => {
        triggerTestNotification();
        testBtn.textContent = '알림 테스트 (5초 후)';
      }, 5000);
    });
  }

  // Close modal on overlay click
  document.getElementById('timeModal').addEventListener('click', e => {
    if (e.target.id === 'timeModal') closeModal();
  });

  setTimeout(() => syncPickerToValue(), 100);
}

/* ── Modal Methods ── */
function openModal(type) {
  currentModalTarget = type;
  const modal = document.getElementById('timeModal');
  const title = document.getElementById('modalTitle');
  const list = document.getElementById('timeOptionsList');
  
  title.textContent = type === 'wake' ? '알림 시작 시간' : '알림 종료 시간';
  list.innerHTML = '';
  
  const currentVal = type === 'wake' ? state.wakeMin : state.sleepMin;
  
  for (let min = 0; min <= 1440; min += 30) {
    const item = document.createElement('div');
    item.className = 'time-item';
    if (min === currentVal) item.classList.add('selected');
    item.textContent = formatTimeLabel(min);
    item.onclick = () => selectTime(min);
    list.appendChild(item);
  }
  
  modal.classList.add('show');
}

window.closeModal = function() {
  document.getElementById('timeModal').classList.remove('show');
};

function selectTime(min) {
  if (currentModalTarget === 'wake') {
    state.wakeMin = min;
    localStorage.setItem(KEYS.wake, min);
  } else {
    state.sleepMin = min;
    localStorage.setItem(KEYS.sleep, min);
  }
  
  closeModal();
  if (state.active) scheduleNext();
  renderAll();
}

function formatTimeLabel(min) {
  if (min === 0 || min === 1440) return '오전 12:00 (자정)';
  if (min === 720) return '오후 12:00 (정오)';
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? '오전' : '오후';
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${ampm} ${hh}:${String(m).padStart(2, '0')}`;
}

/* ── Render Methods ── */
function renderAll() {
  updateStatus();
  updateStats();
  updateTimeline();
  updateIntervalDisplay();
  updateToggleBtn();
  updateTimeButtons();
}

function updateTimeButtons() {
  document.getElementById('wakeBtn').textContent = formatTimeLabel(state.wakeMin);
  document.getElementById('sleepBtn').textContent = formatTimeLabel(state.sleepMin);
}

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

function updateStats() {
  document.getElementById('todayCount').textContent = state.count;
  const ah = calcActiveHours();
  const maxC = calcMaxCount();
  document.getElementById('activeHoursEl').textContent = ah.toFixed(1) + 'h';
  document.getElementById('maxCountEl').textContent = maxC;
}

function updateTimeline() {
  const w = state.wakeMin, s = state.sleepMin;
  const total = 1440;
  const bar = document.querySelector('.timeline-bar');
  if (!bar) return;
  bar.innerHTML = '';

  if (s > w) {
    // Normal case: Start < End
    addTlSegment(bar, 0, w / total * 100, 'sleep');
    addTlSegment(bar, w / total * 100, (s - w) / total * 100, 'active');
    addTlSegment(bar, s / total * 100, (total - s) / total * 100, 'sleep');
  } else {
    // Wrap around: Start > End
    addTlSegment(bar, 0, s / total * 100, 'active');
    addTlSegment(bar, s / total * 100, (w - s) / total * 100, 'sleep');
    addTlSegment(bar, w / total * 100, (total - w) / total * 100, 'active');
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

function updateIntervalDisplay() {
  const min = state.interval;
  const el = document.getElementById('intervalVal');
  if (el) el.textContent = min;
  const sub = document.getElementById('intervalSub');
  if (sub) sub.textContent = '하루 ' + calcMaxCount() + '회 예상';
}

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

/* ── Picker Logic ── */
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
    updateStats(); // Update max count
  }
}

function syncPickerToValue() {
  const picker = document.getElementById('intervalPicker');
  const items = picker.querySelectorAll('.picker-item');
  items.forEach(item => {
    if (parseInt(item.dataset.val) === state.interval) {
      picker.scrollTop = item.offsetTop - 40;
      item.classList.add('selected');
    }
  });
}

/* ── Notification Methods ── */
window.toggleAlarm = async function() {
  if (!state.active) {
    const granted = await requestNotificationPermission();
    if (!granted) {
      document.getElementById('permBanner').classList.add('show');
      return;
    }
    state.active = true;
    scheduleNext();
  } else {
    state.active = false;
    state.nextTime = null;
    localStorage.removeItem(KEYS.nextTime);
  }
  localStorage.setItem(KEYS.active, state.active);
  renderAll();
};

async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

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

async function subscribeAndSendToServer() {
  if (!swReg) return;
  try {
    const pubKey = window.VAPID_PUBLIC_KEY || '';
    if (!pubKey) return;
    let sub = await swReg.pushManager.getSubscription();
    if (!sub) {
      sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pubKey),
      });
    }
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
  } catch(e) { console.warn('Push sync failed:', e); }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function triggerTestNotification() {
  const title = '물 마실 시간이에요!';
  const options = {
    body: '알림 테스트입니다. 정상적으로 작동하고 있어요!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'test-push',
    renotify: true,
    actions: [{ action: 'drink', title: '마셨어요!' }]
  };

  if (swReg && 'showNotification' in swReg) {
    swReg.showNotification(title, options);
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, options);
  } else {
    alert('알림을 보낼 수 있는 상태가 아닙니다. 서비스 워커를 확인해주세요.');
  }
}

/* ── Logic Helpers ── */
function isInActiveWindow() {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = state.wakeMin, end = state.sleepMin;
  
  const isActive = end > start
    ? (cur >= start && cur < end)
    : (cur >= start || cur < end);
    
  return isActive;
}

function calcActiveHours() {
  const start = state.wakeMin, end = state.sleepMin;
  const activeMin = end > start ? end - start : (1440 - start) + end;
  return activeMin / 60;
}

function calcMaxCount() {
  const ah = calcActiveHours();
  const intervalH = state.interval / 60;
  return Math.max(1, Math.floor(ah / intervalH));
}

function showToast(msg) {
  const toast = document.getElementById('drinkToast');
  if (toast) {
    toast.textContent = msg; toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }
}

function checkInstallHint() {
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone) {
    document.getElementById('installHint')?.classList.add('show');
  }
}
