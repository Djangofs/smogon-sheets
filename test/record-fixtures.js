// Re-records the "real" fixtures from the live Google Sheet and Smogon.
// Usage: node test/record-fixtures.js
// Downloads the three sheet tabs as CSV, then the first post of every round
// thread listed in OG Backstage (trimmed to the first <article>).
const fs = require("node:fs");
const path = require("node:path");
const { parseCsv } = require("./harness");

const SHEET_ID = "1g0fWYoCxf3jgGcJya0fockzqt16QMzgIwNJx-CIGHuQ";
const TABS = {
  "backstage.csv": 1796783644,
  "tournaments.csv": 1612462393,
  "circuit.csv": 1680219881,
};
const OUT = path.join(__dirname, "fixtures", "real");
const HTML_OUT = path.join(OUT, "html");

function fixtureName(url) {
  // https://www.smogon.com/forums/threads/adv-nu-cup-round-1.3776192/ -> adv-nu-cup-round-1.3776192.html
  return url.replace(/\/$/, "").split("/").pop() + ".html";
}

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "smogon-sheets-tests" } });
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.text();
}

function firstArticle(html) {
  const start = html.indexOf('<article class="message');
  const end = html.indexOf("</article>", start);
  if (start === -1 || end === -1) throw new Error("no <article class=\"message\"> found");
  return html.slice(start, end + "</article>".length);
}

async function main() {
  fs.mkdirSync(HTML_OUT, { recursive: true });
  for (const [file, gid] of Object.entries(TABS)) {
    const csv = await get(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`);
    fs.writeFileSync(path.join(OUT, file), csv);
    console.log("wrote", file);
  }

  const backstage = parseCsv(fs.readFileSync(path.join(OUT, "backstage.csv"), "utf8"));
  const urls = new Set();
  for (const row of backstage.slice(4)) {
    for (const cell of row) if (cell.startsWith("https://www.smogon.com/forums/threads/")) urls.add(cell);
  }

  for (const url of urls) {
    const html = await get(url);
    fs.writeFileSync(path.join(HTML_OUT, fixtureName(url)), "<html><body>" + firstArticle(html) + "</body></html>\n");
    console.log("wrote", fixtureName(url));
    await new Promise((r) => setTimeout(r, 300)); // be polite to Smogon
  }
}

module.exports = { fixtureName };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
