// Test harness: runs the Apps Script files unmodified inside a vm sandbox with in-memory
// fakes for SpreadsheetApp, UrlFetchApp (serving Smogon pages from a map) and PropertiesService.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Every file in the Apps Script project, loaded into one context like Apps Script's shared global scope.
const SCRIPT_FILES = ["Shared.js", "OGCode.js", "Code.js"];

function loadScripts(globals) {
  const context = vm.createContext({ console: { ...console, log() {} }, ...globals });
  for (const file of SCRIPT_FILES) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  return context;
}

// ---------- CSV ----------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// Sheets returns numbers for numeric cells; the script relies on that (e.g. += on points).
function toSheetValue(str) {
  if (str !== "" && str.trim() === str && !isNaN(Number(str))) return Number(str);
  return str;
}

function loadCsvGrid(file) {
  return parseCsv(fs.readFileSync(file, "utf8")).map((r) => r.map(toSheetValue));
}

// ---------- Fake SpreadsheetApp ----------

class FakeSheet {
  constructor(name, grid = []) {
    this.name = name;
    this.grid = grid.map((r) => r.slice());
  }
  getName() {
    return this.name;
  }
  _get(r, c) {
    const row = this.grid[r - 1];
    if (!row) return "";
    const v = row[c - 1];
    return v === undefined || v === null ? "" : v;
  }
  _set(r, c, v) {
    while (this.grid.length < r) this.grid.push([]);
    const row = this.grid[r - 1];
    while (row.length < c) row.push("");
    row[c - 1] = v === undefined || v === null ? "" : v;
  }
  getLastRow() {
    for (let r = this.grid.length; r >= 1; r--) {
      if (this.grid[r - 1].some((v) => v !== "")) return r;
    }
    return 0;
  }
  getLastColumn() {
    let last = 0;
    for (const row of this.grid) {
      for (let c = row.length; c > last; c--) {
        if (row[c - 1] !== "") {
          last = c;
          break;
        }
      }
    }
    return last;
  }
  clearContents() {
    this.grid = [];
    return this;
  }
  getRange(row, column, numRows = 1, numColumns = 1) {
    for (const [label, v] of [["row", row], ["column", column], ["number of rows", numRows], ["number of columns", numColumns]]) {
      if (!Number.isInteger(v) || v < 1) {
        throw new Error(`${this.name}: invalid range ${label}=${v} in getRange(${row}, ${column}, ${numRows}, ${numColumns})`);
      }
    }
    return new FakeRange(this, row, column, numRows, numColumns);
  }
  // Rows as strings, trimmed of trailing empty cells/rows, for comparisons.
  toStrings(fromRow = 1) {
    const out = this.grid.slice(fromRow - 1).map((r) => {
      const s = r.map((v) => (v === "" ? "" : String(v)));
      while (s.length && s[s.length - 1] === "") s.pop();
      return s;
    });
    while (out.length && out[out.length - 1].length === 0) out.pop();
    return out;
  }
}

class FakeRange {
  constructor(sheet, row, column, numRows, numColumns) {
    Object.assign(this, { sheet, row, column, numRows, numColumns });
  }
  getValue() {
    return this.sheet._get(this.row, this.column);
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numColumns; c++) line.push(this.sheet._get(this.row + r, this.column + c));
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    // Mirror Apps Script's strict dimension check.
    if (!Array.isArray(values) || values.length !== this.numRows) {
      throw new Error(`${this.sheet.name}: setValues got ${values && values.length} rows, range has ${this.numRows}`);
    }
    values.forEach((line, r) => {
      if (!Array.isArray(line) || line.length !== this.numColumns) {
        throw new Error(`${this.sheet.name}: setValues row ${r} has ${line && line.length} columns, range has ${this.numColumns}`);
      }
      line.forEach((v, c) => this.sheet._set(this.row + r, this.column + c, v));
    });
    return this;
  }
  setNumberFormat(format) {
    this.numberFormat = format;
    this.sheet.numberFormats = (this.sheet.numberFormats || []).concat(format);
    return this;
  }
  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numColumns; c++) {
        if (this.sheet.grid[this.row + r - 1]) this.sheet._set(this.row + r, this.column + c, "");
      }
    }
    return this;
  }
}

class FakeSpreadsheet {
  constructor(sheets) {
    this.sheets = new Map(Object.entries(sheets).map(([name, grid]) => [name, new FakeSheet(name, grid)]));
  }
  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }
  insertSheet(name) {
    if (this.sheets.has(name)) throw new Error(`A sheet with the name "${name}" already exists`);
    const sheet = new FakeSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

// ---------- Fake UrlFetchApp / PropertiesService ----------

const TOKEN = "test-token";

// What Smogon serves without a valid scraper token.
const GATE_PAGE =
  '<!DOCTYPE html><html><head><title>Smogon Forums</title></head><body><p id="m">Checking your browser...</p>' +
  '<script>document.cookie = "xf_smogon_gate=" + n;</script></body></html>';

// Serves pages[plainUrl] when the request carries ?/&__scraper-token=<token> (the gate page otherwise),
// and 404 for unknown URLs. `requests` records every URL requested, token included.
function makeUrlFetchApp(pages, token = TOKEN) {
  const requests = [];
  const response = (code, body) => ({ getResponseCode: () => code, getContentText: () => body });
  function respond(request) {
    const url = typeof request === "string" ? request : request.url;
    requests.push(url);
    const m = url.match(/[?&]__scraper-token=([^&]*)$/);
    if (!m || decodeURIComponent(m[1]) !== token) return response(200, GATE_PAGE);
    const plain = url.slice(0, m.index);
    return plain in pages ? response(200, pages[plain]) : response(404, "<html>Not found</html>");
  }
  return {
    requests,
    fetch: (url) => respond(url),
    fetchAll: (requestList) => requestList.map(respond),
  };
}

function makePropertiesService(properties) {
  return { getScriptProperties: () => ({ getProperty: (key) => (key in properties ? properties[key] : null) }) };
}

// The Apps Script project against an in-memory workbook and Smogon. Smogon only accepts `token`;
// the script properties hold `scriptToken` (default: the right one, null: not set).
function appsScript({ sheets = {}, pages = {}, token = TOKEN, scriptToken = token } = {}) {
  const spreadsheet = new FakeSpreadsheet(sheets);
  const urlFetchApp = makeUrlFetchApp(pages, token);
  const scripts = loadScripts({
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    UrlFetchApp: urlFetchApp,
    PropertiesService: makePropertiesService(scriptToken === null ? {} : { SMOGON_SCRAPER_TOKEN: scriptToken }),
  });
  return { spreadsheet, scripts, requests: urlFetchApp.requests };
}

// ---------- Fixture builders ----------

const SMOGON = "https://www.smogon.com";

// Wraps a first-post body in the minimal XenForo markup firstMessage() looks for.
function threadPage(postHtml) {
  return (
    '<html><body><article class="message message--post">' +
    '<div class="bbWrapper">' + postHtml + '<div class="js-selectToQuoteEnd">&nbsp;</div>' +
    "</div></article></body></html>"
  );
}

// A forum listing page linking to the given thread URLs (relative hrefs, as on Smogon).
function forumListingPage(threadUrls) {
  const items = threadUrls
    .map((u) => `<div class="structItem-title"><a href="${u.replace(SMOGON, "")}" data-tp-primary="on">x</a></div>`)
    .join("\n");
  return `<html><body>${items}</body></html>`;
}

// Registers the 4 forum pages getOGRoundURLs() fetches; page 1 holds the links.
function addForumPages(pages, forumUrl, urlEnd, threadUrls) {
  pages[forumUrl + urlEnd] = forumListingPage(threadUrls);
  for (const n of [2, 3, 4]) {
    const key = forumUrl + "page-" + n + urlEnd;
    if (!(key in pages)) pages[key] = "<html><body></body></html>";
  }
  return pages;
}

// ---------- Assertions ----------

function cellName(r, c) {
  let col = "";
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
  return col + (r + 1);
}

// Returns ["E3: expected 'Meri Berry', got 'Ninja'", ...] for two string grids.
function diffGrids(actual, expected) {
  const diffs = [];
  for (let r = 0; r < Math.max(actual.length, expected.length); r++) {
    const a = actual[r] || [];
    const e = expected[r] || [];
    for (let c = 0; c < Math.max(a.length, e.length); c++) {
      const av = a[c] ?? "";
      const ev = e[c] ?? "";
      if (av !== ev) diffs.push(`${cellName(r, c)}: expected ${JSON.stringify(ev)}, got ${JSON.stringify(av)}`);
    }
  }
  return diffs;
}

// ---------- Runner ----------

// Runs a circuit's entry point - by default updateOGSheet (fetch pages, then fill) - against `pages` on Smogon.
function runCircuit({ sheets, pages }, { entry = "updateOGSheet" } = {}) {
  const run = appsScript({ sheets, pages });
  run.scripts[entry]();
  return run;
}

const runFillOGSheet = (workbook) => runCircuit(workbook);

module.exports = {
  parseCsv,
  loadCsvGrid,
  FakeSheet,
  FakeSpreadsheet,
  appsScript,
  makeUrlFetchApp,
  TOKEN,
  GATE_PAGE,
  threadPage,
  forumListingPage,
  addForumPages,
  loadScripts,
  runCircuit,
  runFillOGSheet,
  diffGrids,
  SMOGON,
};
