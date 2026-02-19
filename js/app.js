// ============================================================
// APP - Main Application Logic
// ============================================================

let dashboardData = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  showLoading(true);
  try {
    dashboardData = await loadDashboardData();
    populateAccountSelector(dashboardData.accounts);
    updateLastRunInfo(dashboardData.lastRun);
    renderDashboard('all');
  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

// --- Account Selector ---

function populateAccountSelector(accounts) {
  const select = document.getElementById('account-selector');
  select.innerHTML = '<option value="all">Todas las cuentas</option>';
  accounts
    .filter(a => String(a.active).toUpperCase() === 'TRUE')
    .forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.account_id;
      opt.textContent = acc.account_name;
      select.appendChild(opt);
    });

  select.addEventListener('change', () => renderDashboard(select.value));
}

// --- Last Run Info ---

function updateLastRunInfo(lastRun) {
  const el = document.getElementById('last-update');
  if (!lastRun || lastRun.length === 0) {
    el.textContent = 'Sin datos';
    return;
  }
  const run = lastRun[0];
  if (run.last_run_timestamp) {
    el.textContent = formatDateTime(run.last_run_timestamp);
  }
}

// --- Main Render ---

function renderDashboard(accountId) {
  const am = filterByAccount(dashboardData.accountMetrics, accountId);
  const cm = filterByAccount(dashboardData.campaignMetrics, accountId);

  renderKPIs(am);
  renderTrendChart(am);
  renderCampaignTable(cm);
  renderCampaignBarChart(getLatestData(cm));
}

// --- KPI Cards ---

function renderKPIs(accountMetrics) {
  const latest = getLatestData(accountMetrics);
  const previous = getPreviousData(accountMetrics);

  // Aggregate
  const current = aggregateMetrics(latest);
  const prev = aggregateMetrics(previous);

  const kpis = [
    { id: 'kpi-spend', label: 'Inversion', value: fmtMoney(current.spend), delta: calcDelta(current.spend, prev.spend, false) },
    { id: 'kpi-impressions', label: 'Impresiones', value: fmtNum(current.impressions), delta: calcDelta(current.impressions, prev.impressions, false) },
    { id: 'kpi-clicks', label: 'Clicks', value: fmtNum(current.clicks), delta: calcDelta(current.clicks, prev.clicks, false) },
    { id: 'kpi-ctr', label: 'CTR', value: fmtPct(current.ctr), delta: calcDelta(current.ctr, prev.ctr, false) },
    { id: 'kpi-cpc', label: 'CPC', value: fmtMoney(current.cpc), delta: calcDelta(current.cpc, prev.cpc, true) },
    { id: 'kpi-cpm', label: 'CPM', value: fmtMoney(current.cpm), delta: calcDelta(current.cpm, prev.cpm, true) },
    { id: 'kpi-conversions', label: 'Conversiones', value: fmtNum(current.conversions), delta: calcDelta(current.conversions, prev.conversions, false) },
    { id: 'kpi-cpa', label: 'CPA', value: current.cpa > 0 ? fmtMoney(current.cpa) : '-', delta: current.cpa > 0 ? calcDelta(current.cpa, prev.cpa, true) : null }
  ];

  kpis.forEach(kpi => {
    const el = document.getElementById(kpi.id);
    if (!el) return;
    el.querySelector('.kpi-value').textContent = kpi.value;
    const deltaEl = el.querySelector('.kpi-delta');
    if (kpi.delta && kpi.delta.text !== '0%') {
      deltaEl.textContent = kpi.delta.arrow + ' ' + kpi.delta.text;
      deltaEl.className = 'kpi-delta ' + (kpi.delta.positive ? 'positive' : 'negative');
      deltaEl.style.display = 'block';
    } else {
      deltaEl.style.display = 'none';
    }
  });
}

function aggregateMetrics(rows) {
  if (rows.length === 0) return { spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, frequency: 0, conversions: 0, cpa: 0 };

  const totals = rows.reduce((acc, r) => {
    acc.spend += r.spend;
    acc.impressions += r.impressions;
    acc.reach += r.reach;
    acc.clicks += r.clicks;
    acc.conversions += r.conversions;
    return acc;
  }, { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0 });

  totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100) : 0;
  totals.cpc = totals.clicks > 0 ? (totals.spend / totals.clicks) : 0;
  totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions * 1000) : 0;
  totals.cpa = totals.conversions > 0 ? (totals.spend / totals.conversions) : 0;
  totals.frequency = totals.reach > 0 ? (totals.impressions / totals.reach) : 0;

  return totals;
}

// --- Campaign Table ---

function renderCampaignTable(campaignMetrics) {
  const tbody = document.getElementById('campaign-tbody');
  const latest = getLatestData(campaignMetrics);
  const sorted = [...latest].sort((a, b) => b.spend - a.spend);

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Sin campanas con inversion en este periodo</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map(c => `
    <tr>
      <td class="cell-name" title="${escapeHtml(c.campaign_name)}">${escapeHtml(c.campaign_name)}</td>
      <td class="cell-account">${escapeHtml(c.account_name || '')}</td>
      <td class="cell-number cell-bold">${fmtMoney(c.spend)}</td>
      <td class="cell-number">${fmtNum(c.impressions)}</td>
      <td class="cell-number">${fmtNum(c.clicks)}</td>
      <td class="cell-number">${fmtPct(c.ctr)}</td>
      <td class="cell-number cell-bold">${c.cpa > 0 ? fmtMoney(c.cpa) : '-'}</td>
      <td class="cell-number cell-highlight">${fmtNum(c.conversions)}</td>
    </tr>
  `).join('');
}

// --- Sorting ---

let currentSort = { col: 'spend', asc: false };

function sortTable(column) {
  if (currentSort.col === column) {
    currentSort.asc = !currentSort.asc;
  } else {
    currentSort.col = column;
    currentSort.asc = false;
  }

  // Re-render with sort applied
  const accountId = document.getElementById('account-selector').value;
  const cm = filterByAccount(dashboardData.campaignMetrics, accountId);
  const latest = getLatestData(cm);
  const sorted = [...latest].sort((a, b) => {
    const va = a[column] || 0;
    const vb = b[column] || 0;
    return currentSort.asc ? va - vb : vb - va;
  });

  const tbody = document.getElementById('campaign-tbody');
  tbody.innerHTML = sorted.map(c => `
    <tr>
      <td class="cell-name" title="${escapeHtml(c.campaign_name)}">${escapeHtml(c.campaign_name)}</td>
      <td class="cell-account">${escapeHtml(c.account_name || '')}</td>
      <td class="cell-number cell-bold">${fmtMoney(c.spend)}</td>
      <td class="cell-number">${fmtNum(c.impressions)}</td>
      <td class="cell-number">${fmtNum(c.clicks)}</td>
      <td class="cell-number">${fmtPct(c.ctr)}</td>
      <td class="cell-number cell-bold">${c.cpa > 0 ? fmtMoney(c.cpa) : '-'}</td>
      <td class="cell-number cell-highlight">${fmtNum(c.conversions)}</td>
    </tr>
  `).join('');

  // Update sort indicators
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === column) {
      th.classList.add(currentSort.asc ? 'sort-asc' : 'sort-desc');
    }
  });
}

// --- Formatting Helpers ---

function fmtMoney(n) {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n) {
  return Math.round(Number(n) || 0).toLocaleString('es-AR');
}

function fmtPct(n) {
  return (Number(n) || 0).toFixed(2).replace('.', ',') + '%';
}

function calcDelta(current, previous, inverse) {
  if (previous === 0 && current === 0) return { text: '0%', arrow: '', positive: true };
  if (previous === 0) return { text: '+100%', arrow: '\u2191', positive: !inverse };

  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const sign = delta >= 0 ? '+' : '';
  const isUp = delta >= 0;
  const positive = inverse ? !isUp : isUp;

  return {
    text: sign + delta.toFixed(1).replace('.', ',') + '%',
    arrow: isUp ? '\u2191' : '\u2193',
    positive
  };
}

function formatDateTime(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- UI Helpers ---

function showLoading(show) {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function showError(message) {
  const el = document.getElementById('error-message');
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
  }
}
