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
  wake: 420,    // 07:00
  sleep: 1410,  // 23:30
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

let countdownTimer = null;
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

  const wakeOptions = [
    [300,'오전 5:00'], [330,'오전 5:30'], [360,'오전 6:00'],
    [390,'오전 6:30'], [420,'오전 7:00'], [450,'오전 7:30'],
    [480,'오전 8:00'], [510,'오전 8:30'], [540,'오전 9:00'],
  ];
  const sleepOptions = [
    [1260,'오후 9:00'], [1290,'오후 9:30'], [1320,'오후 10:00'],
    [1350,'오후 10:30'], [1380,'오후 11:00'], [1410,'오후 11:30'],
    [1440,'자정 12:00'],
  ];

  wakeOptions.forEach(([min, label]) => {
    const opt = document.createElement('option');
    opt.value = min; opt.textContent = label;
    if (min === state.wakeMin) opt.selected = true;
    wakeEl.appendChild(opt);
  });
  sleepOptions.forEach(([min, label]) => {
    const opt = document.createElement('option');
    opt.value = min; opt.textContent = label;
    if (min === state.sleepMin) opt.selected = true;
    sleepEl.appendChild(opt);
  });

  wakeEl.addEventListener('change', () => {
    state.wakeMin = parseInt(wakeEl.value);
    localStorage.setItem(KEYS.wake, state.wakeMin);
    if (state.active) scheduleNext();
    updateTimeline();
    updateActiveSummary();
  });
  sleepEl.addEventListener('change', () => {
    state.sleepMin = parseInt(sleepEl.value);
    localStorage.setItem(KEYS.sleep, state.sleepMin);
    if (state.active) scheduleNext();
    updateTimeline();
    updateActiveSummary();
  });

  document.getElementById('intervalSlider').addEventListener('input', e => {
    const steps = [30, 60, 90, 120, 150, 180, 210, 240];
    state.interval = steps[parseInt(e.target.value) - 1];
    localStorage.setItem(KEYS.interval, state.interval);
    if (state.active) scheduleNext();
    updateIntervalDisplay();
    updateActiveSummary();
  });
  const sliderSteps = [30,60,90,120,150,180,210,240];
  const sliderIdx = sliderSteps.indexOf(state.interval);
  document.getElementById('intervalSlider').value = (sliderIdx >= 0 ? sliderIdx : 1) + 1;
}

/* ── Render All ── */
function renderAll() {
  updateStatus();
  updateStats();
  updateTimeline();
  updateIntervalDisplay();
  updateActiveSummary();
  updateToggleBtn();
  updateCountdown();
  if (state.active) startCountdownTimer();
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
  const ah = calcActiveHours();
  document.getElementById('activeHoursEl').textContent = ah.toFixed(1) + 'h';
  document.getElementById('maxCountEl').textContent = calcMaxCount();
}

/* ── Timeline ── */
function updateTimeline() {
  const w = state.wakeMin, s = state.sleepMin;
  const total = 1440;
  const bar = document.querySelector('.timeline-bar');

  bar.innerHTML = '';

  if (s > w) {
    addTlSegment(bar, 0, w / total * 100, 'sleep');
    addTlSegment(bar, w / total * 100, (s - w) / total * 100, 'active');
    addTlSegment(bar, s / total * 100, (total - s) / total * 100, 'sleep');
  } else {
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

/* ── Active Summary ── */
function updateActiveSummary() {
  const ah = calcActiveHours();
  const hh = Math.floor(ah);
  const mm = Math.round((ah - hh) * 60);
  const maxC = calcMaxCount();
  const parts = [];
  if (hh > 0) parts.push(hh + '시간');
  if (mm > 0) parts.push(mm + '분');
  document.getElementById('activeSummary').innerHTML =
    `활성 <strong>${parts.join(' ')}</strong> · 최대 <strong>${maxC}회</strong> 알림 가능`;
}

/* ── Interval Display ── */
function updateIntervalDisplay() {
  const min = state.interval;
  if (min < 60) {
    document.getElementById('intervalVal').textContent = '30';
    document.getElementById('intervalUnit').textContent = '분마다';
  } else {
    document.getElementById('intervalVal').textContent = min / 60 % 1 === 0 ? min / 60 : (min / 60).toFixed(1);
    document.getElementById('intervalUnit').textContent = '시간마다';
  }
  document.getElementById('intervalSub').textContent = '하루 ' + calcMaxCount() + '회 예상';
}

/* ── Toggle ── */
function updateToggleBtn() {
  const btn = document.getElementById('toggleBtn');
  if (state.active) {
    btn.textContent = '알림 끄기';
    btn.className = 'toggle-btn active';
  } else {
    btn.textContent = '알림 켜기';
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
    startCountdownTimer();
  } else {
    state.active = false;
    clearCountdownTimer();
    state.nextTime = null;
    localStorage.removeItem(KEYS.nextTime);
  }
  localStorage.setItem(KEYS.active, state.active);
  updateStatus();
  updateToggleBtn();
  updateCountdown();
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
  updateCountdown();
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

/* ── Countdown Timer ── */
function startCountdownTimer() {
  clearCountdownTimer();
  countdownTimer = setInterval(() => {
    updateCountdown();
    if (state.active && state.nextTime && new Date() >= state.nextTime) {
      triggerLocalNotification();
      logDrink();
      scheduleNext();
    }
  }, 1000);
}

function clearCountdownTimer() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

function updateCountdown() {
  const numEl = document.getElementById('countdownNum');
  const subEl = document.getElementById('nextAlarmText');
  const noticeEl = document.getElementById('sleepNotice');
  const ring = document.querySelector('.ring-progress');

  if (!state.active || !state.nextTime) {
    numEl.textContent = '--:--';
    subEl.textContent = '';
    noticeEl.textContent = '';
    ring.style.strokeDashoffset = 502;
    ring.classList.remove('sleep');
    ring.classList.add('inactive');
    return;
  }

  const now = new Date();
  const diff = Math.max(0, state.nextTime - now);
  const totalMs = state.interval * 60 * 1000;
  const mm = Math.floor(diff / 60000);
  const ss = Math.floor((diff % 60000) / 1000);
  numEl.textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');

  const progress = 1 - diff / totalMs;
  const offset = 502 * (1 - progress);
  ring.style.strokeDashoffset = Math.max(0, offset);

  const inActive = isInActiveWindow();
  if (inActive) {
    ring.classList.remove('inactive', 'sleep');
    subEl.textContent = '다음 알림 ' + formatTime(state.nextTime) + ' 예정';
    noticeEl.textContent = '';
  } else {
    ring.classList.add('sleep');
    ring.classList.remove('inactive');
    subEl.textContent = '활성 시간 외';
    noticeEl.textContent = '💤 수면 시간 · ' + formatTime(new Date(state.wakeMin * 60000 - (new Date().getTimezoneOffset() * 60000 * -1))) + ' 기상 후 알림 시작';
  }
}

/* ── Local Fallback Notification ── */
function triggerLocalNotification() {
  if (!isInActiveWindow()) return;
  if (Notification.permission === 'granted') {
    new Notification('💧 물 마실 시간이에요!', {
      body: '지금 물 한 잔 마셔요. 건강한 하루를 위해!',
      icon: '/public/icon-192.png',
      tag: 'water-reminder',
    });
  }
}

/* ── Helpers ── */
function isInActiveWindow() {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const w = state.wakeMin, s = state.sleepMin;
  return s > w ? (cur >= w && cur < s) : (cur >= w || cur < s);
}

function calcActiveHours() {
  const w = state.wakeMin, s = state.sleepMin;
  const diff = s > w ? s - w : (1440 - w) + s;
  return diff / 60;
}

function calcMaxCount() {
  return Math.floor(calcActiveHours() / (state.interval / 60));
}

function formatTime(date) {
  const h = date.getHours(), m = date.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${ampm} ${hh}:${String(m).padStart(2, '0')}`;
}

function showToast(msg) {
  const toast = document.getElementById('drinkToast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

/* ── iOS Install Hint ── */
function checkInstallHint() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone;
  if (isIOS && !isStandalone) {
    document.getElementById('installHint').classList.add('show');
  }
}
