// ============================================================
// DATA LAYER - Google Sheets Public JSON Fetcher
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
 * Fetch data from a published Google Sheet via gviz/tq endpoint.
 * Requires the sheet to be published to the web (File > Share > Publish to web).
 */
async function fetchSheetData(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch sheet "${sheetName}": ${response.status}`);

  const text = await response.text();
  // Strip JSONP wrapper: google.visualization.Query.setResponse({...});
  const match = text.match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
  if (!match) throw new Error(`Invalid response format from sheet "${sheetName}"`);

  const data = JSON.parse(match[1]);
  if (data.status === 'error') {
    throw new Error(`Sheet error: ${data.errors?.[0]?.detailed_message || 'Unknown'}`);
  }

  // Parse Google Visualization table format into plain objects
  const headers = data.table.cols.map(col => col.label || col.id);
  const colTypes = data.table.cols.map(col => col.type);
  return data.table.rows.map(row => {
    const obj = {};
    row.c.forEach((cell, i) => {
      if (!headers[i]) return;
      if (cell === null) {
        obj[headers[i]] = '';
      } else if (cell.v !== null && cell.v !== undefined) {
        // Convert gviz Date(year,month,day) to YYYY-MM-DD string
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
 * Returns { accounts, accountMetrics, campaignMetrics, lastRun }
 */
async function loadDashboardData() {
  const [accounts, accountMetrics, campaignMetrics, lastRun] = await Promise.all([
    fetchSheetData(CONFIG.SHEETS.accounts),
    fetchSheetData(CONFIG.SHEETS.accountMetrics),
    fetchSheetData(CONFIG.SHEETS.campaignMetrics),
    fetchSheetData(CONFIG.SHEETS.lastRun)
  ]);

  // Parse numeric fields
  accountMetrics.forEach(row => {
    row.spend = Number(row.spend) || 0;
    row.impressions = Number(row.impressions) || 0;
    row.reach = Number(row.reach) || 0;
    row.clicks = Number(row.clicks) || 0;
    row.ctr = Number(row.ctr) || 0;
    row.cpc = Number(row.cpc) || 0;
    row.cpm = Number(row.cpm) || 0;
    row.frequency = Number(row.frequency) || 0;
    row.conversions = Number(row.conversions) || 0;
    row.cpa = Number(row.cpa) || 0;
  });

  campaignMetrics.forEach(row => {
    row.spend = Number(row.spend) || 0;
    row.impressions = Number(row.impressions) || 0;
    row.clicks = Number(row.clicks) || 0;
    row.ctr = Number(row.ctr) || 0;
    row.cpc = Number(row.cpc) || 0;
    row.cpm = Number(row.cpm) || 0;
    row.frequency = Number(row.frequency) || 0;
    row.conversions = Number(row.conversions) || 0;
    row.cpa = Number(row.cpa) || 0;
  });

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
