const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  authHeaders: {},
  tasks: [],
  todayInstances: [],
  weekInstances: [],
  settings: null,
  dashboard: null,
  localStarts: { day: null, week: null },
};

const LOCAL_STARTS_KEY = 'routine_local_starts';

function loadLocalStarts() {
  try {
    const raw = localStorage.getItem(LOCAL_STARTS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.localStarts = {
      day: parsed?.day || null,
      week: parsed?.week || null,
    };
  } catch (_) {
    state.localStarts = { day: null, week: null };
  }
}

function saveLocalStarts() {
  localStorage.setItem(LOCAL_STARTS_KEY, JSON.stringify(state.localStarts));
}

function rememberLocalStart(scope, sessionId) {
  state.localStarts[scope] = {
    sessionId,
    localStartedAt: new Date().toISOString(),
  };
  saveLocalStarts();
}

function clearLocalStart(scope) {
  state.localStarts[scope] = null;
  saveLocalStarts();
}

function bootstrapAuth() {
  const initData = tg?.initData;
  if (initData) {
    state.authHeaders = { 'X-Telegram-Init-Data': initData };
    return;
  }

  const fromStorage = localStorage.getItem('debug_user_id') || '10001';
  state.authHeaders = { 'X-Telegram-User-Id': fromStorage };
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...state.authHeaders,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

function q(id) { return document.getElementById(id); }

function toLocalDateTimeLabel(isoValue) {
  if (!isoValue) return '';
  const dt = new Date(isoValue);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function navSetup() {
  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.screen;
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
      q(`screen-${target}`).classList.remove('hidden');
      renderAll();
    });
  });
}

async function loadAll() {
  const [tasks, todayInstances, weekInstances, settings, dashboard] = await Promise.all([
    api('/tasks'),
    api('/instances?scope=today').catch(() => []),
    api('/instances?scope=week').catch(() => []),
    api('/settings'),
    api('/dashboard'),
  ]);
  state.tasks = tasks;
  state.todayInstances = todayInstances;
  state.weekInstances = weekInstances;
  state.settings = settings;
  state.dashboard = dashboard;
  if (!state.dashboard?.open_day) clearLocalStart('day');
  if (!state.dashboard?.open_week) clearLocalStart('week');
}

function instanceHtml(inst) {
  const statusClass = `status-${inst.status}`;
  return `<div class="list-item">
    <div class="item-head">
      <div class="task-title">${inst.task_title}</div>
      <span class="status-chip ${statusClass}">${inst.status}</span>
    </div>
    <div class="task-meta">
      <span class="chip">Type <b>${inst.task_kind}</b></span>
      <span class="chip">Penalty <b>${inst.penalty_applied || '-'} ${state.settings?.currency || ''}</b></span>
    </div>
    <div class="row">
      <button class="btn ok" onclick="setInstanceStatus(${inst.id},'done')">Done</button>
      <button class="btn gray" onclick="setInstanceStatus(${inst.id},'canceled')">Cancel</button>
      <button class="btn warn" onclick="setInstanceStatus(${inst.id},'failed')">Fail</button>
    </div>
  </div>`;
}

function renderDashboard() {
  const dayStarted = Boolean(state.dashboard?.open_day);
  const weekStarted = Boolean(state.dashboard?.open_week);
  const dayLocal = state.localStarts.day;
  const weekLocal = state.localStarts.week;
  const dayTime = dayStarted && dayLocal?.sessionId === state.dashboard.open_day.id
    ? toLocalDateTimeLabel(dayLocal.localStartedAt)
    : toLocalDateTimeLabel(state.dashboard.open_day?.started_at);
  const weekTime = weekStarted && weekLocal?.sessionId === state.dashboard.open_week.id
    ? toLocalDateTimeLabel(weekLocal.localStartedAt)
    : toLocalDateTimeLabel(state.dashboard.open_week?.started_at);
  const dayStartLabel = dayStarted ? `Start Day (${dayTime})` : 'Start Day';
  const weekStartLabel = weekStarted ? `Start Week (${weekTime})` : 'Start Week';
  const dailyCount = state.tasks.filter(t => t.kind === 'daily').length;
  const weeklyCount = state.tasks.filter(t => t.kind === 'weekly').length;
  const backlogCount = state.tasks.filter(t => t.kind === 'backlog').length;
  q('screen-dashboard').innerHTML = `
    <div class="card">
      <div class="row" style="margin-bottom:10px;">
        <span class="chip">Daily tasks <b>${dailyCount}</b></span>
        <span class="chip">Weekly tasks <b>${weeklyCount}</b></span>
        <span class="chip">Backlog tasks <b>${backlogCount}</b></span>
      </div>
      <div class="row">
        <button class="btn" onclick="startDay()" ${dayStarted ? 'disabled' : ''}>${dayStartLabel}</button>
        <button class="btn warn" onclick="closeDay()" ${dayStarted ? '' : 'disabled'}>Close Day</button>
        <button class="btn" onclick="startWeek()" ${weekStarted ? 'disabled' : ''}>${weekStartLabel}</button>
        <button class="btn warn" onclick="closeWeek()" ${weekStarted ? '' : 'disabled'}>Close Week</button>
      </div>
      <div class="task-meta" style="margin-top:10px;">
        <span class="chip">Open day <b>${state.dashboard?.open_day ? '#' + state.dashboard.open_day.id : 'none'}</b></span>
        <span class="chip">Open week <b>${state.dashboard?.open_week ? '#' + state.dashboard.open_week.id : 'none'}</b></span>
      </div>
    </div>

    <div class="card">
      <h3>Create Task</h3>
      <div class="split">
        <input id="new-title" placeholder="Title" />
        <select id="new-kind">
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
          <option value="backlog">backlog</option>
        </select>
      </div>
      <div class="split" style="margin-top:8px;">
        <input id="new-penalty" type="number" step="0.01" placeholder="Penalty amount (optional)" />
        <select id="new-active"><option value="true">active</option><option value="false">inactive</option></select>
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn" onclick="createTask()">Create</button>
      </div>
    </div>

    <div class="card">
      <h3>All Tasks</h3>
      ${state.tasks.map(t => `<div class="list-item">
        <div class="item-head">
          <div class="task-title">${t.title}</div>
          <span class="chip">${t.kind}</span>
        </div>
        <div class="task-meta">
          <span class="chip">Active <b>${t.is_active ? 'yes' : 'no'}</b></span>
          <span class="chip">Penalty <b>${t.penalty_amount || 'default'}</b></span>
        </div>
        <div class="row">
          <button class="btn gray" onclick="editTask(${t.id})">Edit</button>
          <button class="btn warn" onclick="deleteTask(${t.id})">Delete</button>
        </div>
      </div>`).join('') || '<div class="muted">No tasks</div>'}
    </div>
  `;
}

function renderToday() {
  const backlog = state.tasks.filter(t => t.kind === 'backlog' && t.is_active);
  q('screen-today').innerHTML = `
    <div class="card">
      <h3>Today Instances</h3>
      ${state.todayInstances.map(instanceHtml).join('') || '<div class="muted">No today instances</div>'}
    </div>

    <div class="card">
      <h3>Add Backlog to Today</h3>
      <select id="backlog-to-today">${backlog.map(t => `<option value="${t.id}">${t.title}</option>`).join('')}</select>
      <div class="row" style="margin-top:8px;"><button class="btn" onclick="addBacklog('today')">Add</button></div>
    </div>
  `;
}

function renderWeek() {
  const backlog = state.tasks.filter(t => t.kind === 'backlog' && t.is_active);
  q('screen-week').innerHTML = `
    <div class="card">
      <h3>Week Instances</h3>
      ${state.weekInstances.map(instanceHtml).join('') || '<div class="muted">No week instances</div>'}
    </div>

    <div class="card">
      <h3>Add Backlog to This Week</h3>
      <select id="backlog-to-week">${backlog.map(t => `<option value="${t.id}">${t.title}</option>`).join('')}</select>
      <div class="row" style="margin-top:8px;"><button class="btn" onclick="addBacklog('week')">Add</button></div>
    </div>
  `;
}

function renderBacklog() {
  const backlog = state.tasks.filter(t => t.kind === 'backlog');
  q('screen-backlog').innerHTML = `
    <div class="card">
      <h3>Backlog Tasks</h3>
      ${backlog.map(t => `<div class="list-item">
        <div class="item-head">
          <div class="task-title">${t.title}</div>
          <span class="chip">backlog</span>
        </div>
        <div class="task-meta">
          <span class="chip">Active <b>${t.is_active ? 'yes' : 'no'}</b></span>
          <span class="chip">Penalty <b>${t.penalty_amount || 'default'}</b></span>
        </div>
      </div>`).join('') || '<div class="muted">No backlog tasks</div>'}
    </div>
  `;
}

async function renderStats() {
  const periods = ['days', 'weeks', 'months'];
  const rows = [];
  for (const p of periods) {
    const s = await api(`/stats?period=${p}`);
    rows.push(`<div class="list-item">
      <div class="item-head">
        <div class="task-title">${p}</div>
        <span class="chip">Failed <b>${s.failed_count}</b></span>
      </div>
      <div class="task-meta">
        <span class="chip">Penalty <b>${s.total_penalty} ${state.settings.currency}</b></span>
      </div>
    </div>`);
  }
  q('screen-stats').innerHTML = `
    <div class="card">
      <div class="item-head">
        <h3>Penalty Stats</h3>
        <button class="btn warn" onclick="clearStats()">Clear Stats</button>
      </div>
      <p class="muted">Will delete all instance history and day/week sessions.</p>
      ${rows.join('')}
    </div>
  `;
}

function renderAll() {
  renderDashboard();
  renderToday();
  renderWeek();
  renderBacklog();
  renderStats();
}

async function refreshAndRender() {
  try {
    await loadAll();
    renderAll();
  } catch (e) {
    alert(e.message);
  }
}

async function startDay() {
  const result = await api('/sessions/start_day', { method: 'POST' });
  rememberLocalStart('day', result.id);
  await refreshAndRender();
}
async function closeDay() {
  const result = await api('/sessions/close_day', { method: 'POST' });
  clearLocalStart('day');
  alert(`Day closed. Done: ${result.done_count}, Canceled: ${result.canceled_count}, Failed: ${result.failed_count}. To transfer: ${result.amount_to_transfer} ${result.currency}`);
  await refreshAndRender();
}
async function startWeek() {
  const result = await api('/sessions/start_week', { method: 'POST' });
  rememberLocalStart('week', result.id);
  await refreshAndRender();
}
async function closeWeek() {
  const result = await api('/sessions/close_week', { method: 'POST' });
  clearLocalStart('week');
  alert(`Week closed. Done: ${result.done_count}, Canceled: ${result.canceled_count}, Failed: ${result.failed_count}. To transfer: ${result.amount_to_transfer} ${result.currency}`);
  await refreshAndRender();
}

async function createTask() {
  const title = q('new-title').value.trim();
  if (!title) return alert('Title required');
  const penaltyRaw = q('new-penalty').value.trim();
  await api('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title,
      kind: q('new-kind').value,
      is_active: q('new-active').value === 'true',
      penalty_amount: penaltyRaw ? Number(penaltyRaw) : null,
    }),
  });
  q('new-title').value = '';
  q('new-penalty').value = '';
  await refreshAndRender();
}

async function editTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  const title = prompt('Title', task.title);
  if (!title) return;
  const kind = prompt('Kind: daily|weekly|backlog', task.kind);
  if (!['daily', 'weekly', 'backlog'].includes(kind)) return alert('Invalid kind');
  const isActiveInput = prompt('Active: true|false', String(task.is_active));
  if (!['true', 'false'].includes(isActiveInput)) return alert('Invalid active flag');
  const penalty = prompt('Penalty amount (empty = null)', task.penalty_amount ?? '');
  await api(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      title,
      kind,
      is_active: isActiveInput === 'true',
      penalty_amount: penalty === '' ? null : Number(penalty),
    }),
  });
  await refreshAndRender();
}

async function deleteTask(id) {
  if (!confirm('Delete task?')) return;
  await api(`/tasks/${id}`, { method: 'DELETE' });
  await refreshAndRender();
}

async function setInstanceStatus(id, status) {
  await api(`/instances/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
  await refreshAndRender();
}

async function addBacklog(scope) {
  const taskId = Number(q(scope === 'today' ? 'backlog-to-today' : 'backlog-to-week').value);
  await api('/instances/add_backlog', { method: 'POST', body: JSON.stringify({ task_id: taskId, scope }) });
  await refreshAndRender();
}

async function clearStats() {
  if (!confirm('Delete all statistics (instances and day/week sessions)?')) return;
  await api('/stats', { method: 'DELETE' });
  clearLocalStart('day');
  clearLocalStart('week');
  await refreshAndRender();
}

window.startDay = startDay;
window.closeDay = closeDay;
window.startWeek = startWeek;
window.closeWeek = closeWeek;
window.createTask = createTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.setInstanceStatus = setInstanceStatus;
window.addBacklog = addBacklog;
window.clearStats = clearStats;

async function init() {
  loadLocalStarts();
  bootstrapAuth();
  navSetup();
  await refreshAndRender();
}

init();
