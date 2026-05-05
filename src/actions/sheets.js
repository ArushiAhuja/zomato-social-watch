import { google } from 'googleapis';

let _sheets = null;

function parseCredentials(raw) {
  // Try plain JSON first; fall back to base64-encoded JSON
  try {
    return JSON.parse(raw);
  } catch {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  }
}

function getSheets() {
  if (_sheets) return _sheets;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');

  const credentials = parseCredentials(raw);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

function toRow(post) {
  return [
    new Date().toISOString(),
    post.source,
    post.category ?? 'NOISE',
    post.score ?? 0,
    post.escalate ? 'YES' : 'NO',
    post.title ?? '',
    post.url ?? '',
    post.author ?? '',
    post.reasoning ?? '',
  ];
}

export async function logToSheet(post, { dryRun = false } = {}) {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!sheetId) {
    // Silently skip — already warned at startup via env.js
    return;
  }

  const row = toRow(post);

  if (dryRun) {
    console.log(`[sheets] DRY RUN — would append row: ${JSON.stringify(row)}`);
    return;
  }

  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:I',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}
