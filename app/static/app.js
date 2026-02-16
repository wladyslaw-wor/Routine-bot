const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  authHeaders: {},
  tgInitData: '',
  tasks: [],
  todayInstances: [],
  weekInstances: [],
  settings: null,
  dashboard: null,
  localStarts: { day: null, week: null },
  statsDetail: null,
  activeStatsPeriod: null,
  draggedTaskId: null,
  touchDrag: {
    active: false,
    taskId: null,
    targetTaskId: null,
    timer: null,
  },
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
    state.tgInitData = initData;
    state.authHeaders = {
      'X-Telegram-Init-Data': initData,
      Authorization: `tma ${initData}`,
    };
    return;
  }

  const fromStorage = localStorage.getItem('debug_user_id') || '10001';
  state.authHeaders = { 'X-Telegram-User-Id': fromStorage };
}

async function api(path, options = {}) {
  let authPath = `/api${path}`;
  if (state.tgInitData) {
    const sep = authPath.includes('?') ? '&' : '?';
    authPath = `${authPath}${sep}initData=${encodeURIComponent(state.tgInitData)}`;
  }
  const res = await fetch(authPath, {
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

function resolveTaskPenaltyAmount(task) {
  if (!task || !state.settings) return null;
  if (task.penalty_amount !== null && task.penalty_amount !== undefined) return task.penalty_amount;
  if (task.kind === 'weekly') return state.settings.penalty_weekly_default;
  return state.settings.penalty_daily_default;
}

function instancePenaltyAmount(inst) {
  if (inst.penalty_applied !== null && inst.penalty_applied !== undefined) return inst.penalty_applied;
  const task = state.tasks.find(t => t.id === inst.task_id);
  return resolveTaskPenaltyAmount(task);
}

function statusDropdownHtml(inst) {
  const statuses = ['planned', 'done', 'canceled', 'failed'];
  const options = statuses.map(s => (
    `<button type="button" class="status-menu-item ${inst.status === s ? 'active' : ''}" onclick="setInstanceStatus(${inst.id},'${s}')">${s}</button>`
  )).join('');
  return `<details class="status-dd" ontoggle="onStatusDetailsToggle(event)">
    <summary class="status-chip status-action status-${inst.status}">${inst.status}</summary>
    <div class="status-menu">${options}</div>
  </details>`;
}

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

function toLocalDateLabel(isoValue) {
  if (!isoValue) return '';
  const dt = new Date(isoValue);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
  const penalty = instancePenaltyAmount(inst);
  return `<div class="list-item reorder-item" draggable="true" data-task-id="${inst.task_id}">
    <div class="item-head">
      <div class="task-title">${inst.task_title}</div>
      <div class="row">
        <span class="drag-handle">⋮⋮</span>
        ${statusDropdownHtml(inst)}
      </div>
    </div>
    <div class="task-meta">
      <span class="chip">Type <b>${inst.task_kind}</b></span>
      <span class="chip">Penalty <b>${penalty ?? '-'} ${state.settings?.currency || ''}</b></span>
    </div>
  </div>`;
}

function doneInstanceHtml(inst) {
  return `<div class="list-item reorder-item" draggable="true" data-task-id="${inst.task_id}">
    <div class="item-head">
      <div class="task-title">${inst.task_title}</div>
      <div class="row">
        <span class="drag-handle">⋮⋮</span>
        ${statusDropdownHtml(inst)}
      </div>
    </div>
    <div class="task-meta">
      <span class="chip">Scope <b>${inst.scope}</b></span>
      <span class="chip">Type <b>${inst.task_kind}</b></span>
      <span class="chip">Penalty <b>${instancePenaltyAmount(inst) ?? '-'} ${state.settings?.currency || ''}</b></span>
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
  const backlogActive = state.tasks.filter(t => t.kind === 'backlog' && t.is_active);
  const todayOpenItems = state.todayInstances.filter(i => i.status === 'planned');
  const weekOpenItems = state.weekInstances.filter(i => i.status === 'planned');
  const doneItems = [
    ...state.todayInstances.filter(i => i.status === 'done').map(i => ({ ...i, scope: 'Today' })),
    ...state.weekInstances.filter(i => i.status === 'done').map(i => ({ ...i, scope: 'Week' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const canceledFailedItems = [
    ...state.todayInstances.filter(i => i.status === 'canceled' || i.status === 'failed').map(i => ({ ...i, scope: 'Today' })),
    ...state.weekInstances.filter(i => i.status === 'canceled' || i.status === 'failed').map(i => ({ ...i, scope: 'Week' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
      <h3>Today Instances</h3>
      ${todayOpenItems.map(instanceHtml).join('') || '<div class="muted">No planned today instances</div>'}
      <div style="margin-top:10px;">
        <select id="backlog-to-today">${backlogActive.map(t => `<option value="${t.id}">${t.title}</option>`).join('')}</select>
        <div class="row" style="margin-top:8px;">
          <button class="btn" onclick="addBacklog('today')">Add Backlog to Today</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Week Instances</h3>
      ${weekOpenItems.map(instanceHtml).join('') || '<div class="muted">No planned week instances</div>'}
      <div style="margin-top:10px;">
        <select id="backlog-to-week">${backlogActive.map(t => `<option value="${t.id}">${t.title}</option>`).join('')}</select>
        <div class="row" style="margin-top:8px;">
          <button class="btn" onclick="addBacklog('week')">Add Backlog to Week</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Done Tasks</h3>
      ${doneItems.map(doneInstanceHtml).join('') || '<div class="muted">No done tasks yet</div>'}
    </div>

    <div class="card">
      <h3>Canceled & Failed</h3>
      ${canceledFailedItems.map(doneInstanceHtml).join('') || '<div class="muted">No canceled or failed tasks</div>'}
    </div>
  `;
}

function renderTasks() {
  q('screen-tasks').innerHTML = `
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
      ${state.tasks.map((t) => `<div class="list-item reorder-item" draggable="true" data-task-id="${t.id}">
        <div class="item-head">
          <div class="task-title">${t.title}</div>
          <div class="row">
            <span class="drag-handle">⋮⋮</span>
            <span class="chip">${t.kind}</span>
          </div>
        </div>
        <div class="task-meta">
          <span class="chip">Active <b>${t.is_active ? 'yes' : 'no'}</b></span>
          <span class="chip">Penalty <b>${resolveTaskPenaltyAmount(t)} ${state.settings?.currency || ''}</b></span>
        </div>
        <div class="row">
          <button class="btn gray" onclick="editTask(${t.id})">Edit</button>
          <button class="btn warn" onclick="deleteTask(${t.id})">Delete</button>
        </div>
      </div>`).join('') || '<div class="muted">No tasks</div>'}
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
          <span class="chip">Penalty <b>${resolveTaskPenaltyAmount(t)} ${state.settings?.currency || ''}</b></span>
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
    rows.push(`<button type="button" class="list-item tile-btn ${state.activeStatsPeriod === p ? 'active' : ''}" onclick="openStatsDetails('${p}')">
      <div class="item-head">
        <div class="task-title">${p}</div>
        <span class="chip">Failed <b>${s.failed_count}</b></span>
      </div>
      <div class="task-meta">
        <span class="chip">Penalty <b>${s.total_penalty} ${state.settings.currency}</b></span>
      </div>
    </button>`);
  }
  const detail = state.statsDetail;
  let groupedDetailsHtml = '';
  if (detail && detail.rows.length) {
    const dayMap = new Map();
    detail.rows.forEach(r => {
      const dayKey = toLocalDateLabel(r.started_at);
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, { total: 0, items: [] });
      const group = dayMap.get(dayKey);
      group.total += Number(r.total_penalty || 0);
      group.items.push(r);
    });
    groupedDetailsHtml = Array.from(dayMap.entries()).map(([day, group]) => `
      <div class="list-item" style="margin-top:10px;">
        <div class="item-head">
          <div class="task-title">${day}</div>
          <span class="chip">Day total <b>${group.total.toFixed(2)} ${state.settings.currency}</b></span>
        </div>
        ${group.items.map(r => `<div class="list-item">
          <div class="item-head">
            <div class="task-title">${r.task_title}</div>
            <span class="status-chip status-${r.status}">${r.status}</span>
          </div>
          <div class="task-meta">
            <span class="chip">Started <b>${toLocalDateTimeLabel(r.started_at)}</b></span>
            <span class="chip">Penalty <b>${r.total_penalty} ${state.settings.currency}</b></span>
          </div>
        </div>`).join('')}
      </div>
    `).join('');
  }
  const detailHtml = detail ? `
    <div class="card" style="margin-top:10px;">
      <h3>${detail.period} details</h3>
      <div class="task-meta">
        <span class="chip">Planned <b>${detail.status_counts.planned}</b></span>
        <span class="chip">Done <b>${detail.status_counts.done}</b></span>
        <span class="chip">Canceled <b>${detail.status_counts.canceled}</b></span>
        <span class="chip">Failed <b>${detail.status_counts.failed}</b></span>
        <span class="chip">Penalty <b>${detail.total_penalty} ${state.settings.currency}</b></span>
      </div>
      ${groupedDetailsHtml || '<div class="muted">No data for selected period</div>'}
    </div>
  ` : '';
  q('screen-stats').innerHTML = `
    <div class="card">
      <div class="item-head">
        <h3>Penalty Stats</h3>
        <button class="btn warn" onclick="clearStats()">Clear Stats</button>
      </div>
      <p class="muted">Tap a tile to open detailed statistics. Clear will delete all instance history and day/week sessions.</p>
      ${rows.join('')}
    </div>
    ${detailHtml}
  `;
}

function renderAll() {
  renderDashboard();
  renderTasks();
  renderBacklog();
  renderStats();
  bindReorderDnD();
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

async function reorderTasksByDrop(draggedTaskId, targetTaskId) {
  if (!draggedTaskId || !targetTaskId || draggedTaskId === targetTaskId) return;
  const ids = state.tasks.map(t => t.id);
  const from = ids.indexOf(draggedTaskId);
  const to = ids.indexOf(targetTaskId);
  if (from < 0 || to < 0) return;
  ids.splice(from, 1);
  ids.splice(to, 0, draggedTaskId);
  await api('/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify({ ordered_ids: ids }),
  });
  await refreshAndRender();
}

function bindReorderDnD() {
  const items = document.querySelectorAll('.reorder-item[data-task-id]');
  items.forEach((item) => {
    item.addEventListener('dragstart', (e) => {
      const taskId = Number(item.dataset.taskId);
      state.draggedTaskId = taskId;
      item.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(taskId));
      }
    });

    item.addEventListener('dragend', () => {
      state.draggedTaskId = null;
      document.querySelectorAll('.reorder-item.dragging').forEach(el => el.classList.remove('dragging'));
      document.querySelectorAll('.reorder-item.drop-target').forEach(el => el.classList.remove('drop-target'));
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      item.classList.add('drop-target');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drop-target');
    });

    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      item.classList.remove('drop-target');
      const targetTaskId = Number(item.dataset.taskId);
      const dragged = state.draggedTaskId || Number(e.dataTransfer?.getData('text/plain'));
      await reorderTasksByDrop(dragged, targetTaskId);
    });

    bindTouchDnDItem(item);
  });
}

function clearTouchDragVisuals() {
  document.querySelectorAll('.reorder-item.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.reorder-item.drop-target').forEach(el => el.classList.remove('drop-target'));
}

function resetTouchDrag() {
  if (state.touchDrag.timer) {
    clearTimeout(state.touchDrag.timer);
    state.touchDrag.timer = null;
  }
  state.touchDrag.active = false;
  state.touchDrag.taskId = null;
  state.touchDrag.targetTaskId = null;
  clearTouchDragVisuals();
}

function bindTouchDnDItem(item) {
  item.addEventListener('touchstart', (e) => {
    if (e.target.closest('.status-dd')) return;
    if (state.touchDrag.timer) clearTimeout(state.touchDrag.timer);
    const taskId = Number(item.dataset.taskId);
    state.touchDrag.timer = setTimeout(() => {
      state.touchDrag.active = true;
      state.touchDrag.taskId = taskId;
      state.touchDrag.targetTaskId = taskId;
      item.classList.add('dragging');
    }, 220);
  }, { passive: true });

  item.addEventListener('touchmove', (e) => {
    if (!state.touchDrag.active) return;
    e.preventDefault();
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.reorder-item[data-task-id]');
    document.querySelectorAll('.reorder-item.drop-target').forEach(el => el.classList.remove('drop-target'));
    if (target) {
      target.classList.add('drop-target');
      state.touchDrag.targetTaskId = Number(target.dataset.taskId);
    }
  }, { passive: false });

  item.addEventListener('touchend', async () => {
    if (!state.touchDrag.active) {
      resetTouchDrag();
      return;
    }
    const from = state.touchDrag.taskId;
    const to = state.touchDrag.targetTaskId;
    resetTouchDrag();
    await reorderTasksByDrop(from, to);
  }, { passive: true });

  item.addEventListener('touchcancel', () => {
    resetTouchDrag();
  }, { passive: true });
}

async function clearStats() {
  if (!confirm('Delete all statistics (instances and day/week sessions)?')) return;
  await api('/stats', { method: 'DELETE' });
  state.activeStatsPeriod = null;
  state.statsDetail = null;
  clearLocalStart('day');
  clearLocalStart('week');
  await refreshAndRender();
}

async function openStatsDetails(period) {
  state.activeStatsPeriod = period;
  state.statsDetail = await api(`/stats/details?period=${period}`);
  await renderStats();
}

function onStatusDetailsToggle(event) {
  const details = event.currentTarget;
  const parentItem = details.closest('.list-item');
  const parentCard = details.closest('.card');
  document.querySelectorAll('.card.status-open').forEach(el => el.classList.remove('status-open'));
  document.querySelectorAll('.list-item.status-open').forEach(el => el.classList.remove('status-open'));
  if (details.open && parentItem) parentItem.classList.add('status-open');
  if (details.open && parentCard) parentCard.classList.add('status-open');
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
window.openStatsDetails = openStatsDetails;
window.onStatusDetailsToggle = onStatusDetailsToggle;

async function init() {
  loadLocalStarts();
  bootstrapAuth();
  navSetup();
  await refreshAndRender();
}

init();
