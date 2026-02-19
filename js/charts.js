// ============================================================
// CHARTS - Chart.js Configurations
// ============================================================

let trendChart = null;
let campaignBarChart = null;

const CHART_COLORS = {
  primary: '#3b82f6',
  primaryLight: 'rgba(59, 130, 246, 0.1)',
  warning: '#f59e0b',
  warningLight: 'rgba(245, 158, 11, 0.1)',
  success: '#22c55e',
  danger: '#ef4444',
  gray: '#6b7280',
  gridLine: '#f3f4f6',
  barGradient: ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308']
};

/**
 * Render trend line chart: spend + clicks over collection dates.
 * @param {Array} accountMetrics - Filtered account metrics
 */
function renderTrendChart(accountMetrics) {
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;

  if (trendChart) trendChart.destroy();

  const dates = getCollectionDates(accountMetrics);
  if (dates.length === 0) {
    canvas.parentElement.innerHTML = '<p class="empty-state">Sin datos historicos para graficar</p>';
    return;
  }

  // Aggregate per date (in case multiple accounts selected)
  const spendByDate = {};
  const clicksByDate = {};
  dates.forEach(d => { spendByDate[d] = 0; clicksByDate[d] = 0; });
  accountMetrics.forEach(row => {
    spendByDate[row.date_collected] = (spendByDate[row.date_collected] || 0) + row.spend;
    clicksByDate[row.date_collected] = (clicksByDate[row.date_collected] || 0) + row.clicks;
  });

  const labels = dates.map(d => formatDateShort(d));

  trendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Inversion ($)',
          data: dates.map(d => spendByDate[d].toFixed(2)),
          borderColor: CHART_COLORS.primary,
          backgroundColor: CHART_COLORS.primaryLight,
          fill: true,
          tension: 0.3,
          yAxisID: 'y',
          pointRadius: 4,
          pointBackgroundColor: CHART_COLORS.primary,
          pointHoverRadius: 6
        },
        {
          label: 'Clicks',
          data: dates.map(d => clicksByDate[d]),
          borderColor: CHART_COLORS.warning,
          backgroundColor: CHART_COLORS.warningLight,
          fill: false,
          tension: 0.3,
          yAxisID: 'y1',
          pointRadius: 4,
          pointBackgroundColor: CHART_COLORS.warning,
          pointHoverRadius: 6,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: CHART_COLORS.gray, font: { size: 12 }, usePointStyle: true, padding: 20 } },
        tooltip: {
          backgroundColor: '#1f2937',
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: ctx => {
              if (ctx.datasetIndex === 0) return ` Inversion: $${Number(ctx.raw).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
              return ` Clicks: ${Number(ctx.raw).toLocaleString('es-AR')}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          position: 'left',
          title: { display: true, text: 'Inversion ($)', color: CHART_COLORS.primary, font: { size: 11 } },
          grid: { color: CHART_COLORS.gridLine },
          ticks: { color: CHART_COLORS.gray, callback: v => '$' + v.toLocaleString('es-AR') }
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          title: { display: true, text: 'Clicks', color: CHART_COLORS.warning, font: { size: 11 } },
          grid: { display: false },
          ticks: { color: CHART_COLORS.gray }
        },
        x: {
          grid: { display: false },
          ticks: { color: CHART_COLORS.gray, font: { size: 11 } }
        }
      }
    }
  });
}

/**
 * Render campaign bar chart: top 10 campaigns by spend.
 * @param {Array} campaignMetrics - Filtered campaign metrics (latest period only)
 */
function renderCampaignBarChart(campaignMetrics) {
  const canvas = document.getElementById('campaign-bar-chart');
  if (!canvas) return;

  if (campaignBarChart) campaignBarChart.destroy();

  const sorted = [...campaignMetrics].sort((a, b) => b.spend - a.spend).slice(0, 10);

  if (sorted.length === 0) {
    canvas.parentElement.innerHTML = '<p class="empty-state">Sin campanas con inversion en este periodo</p>';
    return;
  }

  const labels = sorted.map(c => c.campaign_name.length > 25 ? c.campaign_name.substring(0, 25) + '...' : c.campaign_name);
  const colors = sorted.map((_, i) => CHART_COLORS.barGradient[i % CHART_COLORS.barGradient.length]);

  campaignBarChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Inversion ($)',
        data: sorted.map(c => c.spend.toFixed(2)),
        backgroundColor: colors,
        borderRadius: 6,
        barPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2937',
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: ctx => ` $${Number(ctx.raw).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: CHART_COLORS.gridLine },
          ticks: { color: CHART_COLORS.gray, callback: v => '$' + v.toLocaleString('es-AR') }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#1f2937', font: { size: 11 } }
        }
      }
    }
  });
}

/**
 * Render account spend comparison bar chart (for "all" view).
 * @param {Array} accountMetrics - All account metrics
 */
function renderAccountSpendChart(accountMetrics) {
  const canvas = document.getElementById('campaign-bar-chart');
  if (!canvas) return;

  if (campaignBarChart) campaignBarChart.destroy();

  const latest = getLatestData(accountMetrics);
  const sorted = [...latest].filter(r => r.spend > 0).sort((a, b) => b.spend - a.spend);

  if (sorted.length === 0) {
    canvas.parentElement.innerHTML = '<p class="empty-state">Sin datos de inversion</p>';
    return;
  }

  const labels = sorted.map(r => r.account_name);
  const colors = sorted.map((_, i) => CHART_COLORS.barGradient[i % CHART_COLORS.barGradient.length]);

  campaignBarChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Inversion ($)',
        data: sorted.map(r => r.spend.toFixed(2)),
        backgroundColor: colors,
        borderRadius: 6,
        barPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2937',
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: ctx => ` $${Number(ctx.raw).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: CHART_COLORS.gridLine },
          ticks: { color: CHART_COLORS.gray, callback: v => '$' + v.toLocaleString('es-AR') }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#1f2937', font: { size: 11 } }
        }
      }
    }
  });
}

// Helper
function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '/' + parts[1];
}
