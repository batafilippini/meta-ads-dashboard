// ============================================================
// DATA LAYER - Google Sheets via JSONP (gviz/tq endpoint)
// ============================================================

const CONFIG = {
  SPREADSHEET_ID: '1Bj9KXDDIvs4DRFKZIdI35jAzvEXt9UpaLh3nWWMmNEc',
  SHEETS: {
    accounts: 'Accounts',
    accountMetrics: 'Account Metrics',
    campaignMetrics: 'Campaign Metrics',
    lastRun: 'Last Run'
  }
};

/**
 * Fetch data from a Google Sheet via gviz/tq JSONP endpoint.
 * Uses script tag injection to bypass CORS restrictions.
 */
function fetchSheetData(sheetName) {
  return new Promise((resolve, reject) => {
    const cbName = '_gviz_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:${cbName}&sheet=${encodeURIComponent(sheetName)}`;

    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout loading sheet "${sheetName}"`));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = function(data) {
      cleanup();
      if (data.status === 'error') {
        reject(new Error(`Sheet error: ${data.errors?.[0]?.detailed_message || 'Unknown'}`));
        return;
      }
      resolve(parseGvizTable(data.table));
    };

    script.src = url;
    script.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load sheet "${sheetName}"`));
    };
    document.head.appendChild(script);
  });
}

/**
 * Parse gviz table format into array of plain objects.
 */
function parseGvizTable(table) {
  const headers = table.cols.map(col => col.label || col.id);
  return table.rows.map(row => {
    const obj = {};
    row.c.forEach((cell, i) => {
      if (!headers[i]) return;
      if (cell === null) {
        obj[headers[i]] = '';
      } else if (cell.v !== null && cell.v !== undefined) {
        // Convert gviz Date(year,month,day) to YYYY-MM-DD (month is 0-indexed)
        if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) {
          const m = cell.v.match(/Date\((\d+),(\d+),(\d+)\)/);
          if (m) {
            obj[headers[i]] = `${m[1]}-${String(parseInt(m[2]) + 1).padStart(2, '0')}-${String(parseInt(m[3])).padStart(2, '0')}`;
          } else {
            obj[headers[i]] = cell.f || cell.v;
          }
        } else {
          obj[headers[i]] = cell.v;
        }
      } else {
        obj[headers[i]] = '';
      }
    });
    return obj;
  });
}

/**
 * Load all dashboard data from Google Sheets.
 */
async function loadDashboardData() {
  const [accounts, accountMetrics, campaignMetrics, lastRun] = await Promise.all([
    fetchSheetData(CONFIG.SHEETS.accounts),
    fetchSheetData(CONFIG.SHEETS.accountMetrics),
    fetchSheetData(CONFIG.SHEETS.campaignMetrics),
    fetchSheetData(CONFIG.SHEETS.lastRun)
  ]);

  const numFields = ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm', 'frequency', 'conversions', 'cpa'];
  accountMetrics.forEach(row => numFields.forEach(f => { row[f] = Number(row[f]) || 0; }));
  campaignMetrics.forEach(row => numFields.filter(f => f !== 'reach').forEach(f => { row[f] = Number(row[f]) || 0; }));

  return { accounts, accountMetrics, campaignMetrics, lastRun };
}

/**
 * Filter metrics by account_id. If 'all', returns all rows.
 */
function filterByAccount(rows, accountId) {
  if (accountId === 'all') return rows;
  return rows.filter(r => r.account_id === accountId);
}

/**
 * Get only the latest collection date's data.
 */
function getLatestData(rows) {
  if (rows.length === 0) return [];
  const dates = [...new Set(rows.map(r => r.date_collected))].sort();
  const latest = dates[dates.length - 1];
  return rows.filter(r => r.date_collected === latest);
}

/**
 * Get previous collection date's data (for deltas).
 */
function getPreviousData(rows) {
  if (rows.length === 0) return [];
  const dates = [...new Set(rows.map(r => r.date_collected))].sort();
  if (dates.length < 2) return [];
  const previous = dates[dates.length - 2];
  return rows.filter(r => r.date_collected === previous);
}

/**
 * Get unique collection dates sorted ascending.
 */
function getCollectionDates(rows) {
  return [...new Set(rows.map(r => r.date_collected))].sort();
}
