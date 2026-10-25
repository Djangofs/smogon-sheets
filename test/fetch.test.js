// fetchCircuitPages() in Shared.js: downloading from Smogon with the scraper token into a pages
// sheet, and readPage() reading it back.
const test = require("node:test");
const assert = require("node:assert/strict");
const { appsScript, threadPage, forumListingPage, TOKEN, SMOGON } = require("./harness");

const FORUM = SMOGON + "/forums/forums/smogon-metagames-circuits.474/";
const URL_END = "?prefix_id=412";
const thread = (slug) => `${SMOGON}/forums/threads/${slug}/`;
const R1 = thread("cup-one-round-1.3000001");
const R2 = thread("cup-one-round-2.3000002");
const OTHER = thread("cup-two-round-1.3000003");

const playerLink = (id, name) =>
  `<a href="${SMOGON}/forums/members/${id}/" class="username" data-user-id="${id}" data-username="${name}">${name}</a>`;
const POST_1 = "<b>Rules</b><br />" + playerLink(1, "Alice") + " vs " + playerLink(2, "Bob");
const POST_2 = "<b>Rules</b><br />" + playerLink(1, "Alice") + " vs " + playerLink(3, "Cara");

// Backstage with one tournament block per tourStr, all on the same forum.
function backstage(...tourStrs) {
  const rows = [["NAME OF MAIN SHEET", "NAME OF TOUR SHEET"], ["OG Circuit", "OG Tournaments"], ["", "OLDEST THREAD NUMBER"], ["", 3000000], ["", ""]];
  tourStrs.forEach((tourStr, i) => {
    const col = 2 + i * 4;
    rows[0][col] = "FORUM URL";
    rows[1][col] = FORUM;
    rows[1][col + 1] = tourStr;
    rows[1][col + 2] = "No";
    rows[4][col] = URL_END;
  });
  return rows.map((r) => Array.from(r, (v) => v ?? ""));
}

// Smogon with a listing page (newest first, plus a late-reply bump of round 1) and the round threads.
function smogon(extra = {}) {
  return {
    [FORUM + URL_END]: forumListingPage([R1, R2, R1, OTHER]),
    [FORUM + "page-2" + URL_END]: "<html><body></body></html>",
    [R1]: threadPage(POST_1) + '<article class="message"><div class="bbWrapper">a reply</div></article>',
    [R2]: threadPage(POST_2),
    [OTHER]: threadPage(POST_1),
    ...extra,
  };
}

const rowsOf = (spreadsheet, name = "OG Pages") => spreadsheet.getSheetByName(name).toStrings();

test("fetches every listing page and round thread once, with the token on each request", () => {
  const { scripts, requests } = appsScript({ sheets: { "OG Backstage": backstage("cup-one", "cup-two") }, pages: smogon() });
  scripts.fetchOGPages();

  const withToken = (url) => url + (url.includes("?") ? "&" : "?") + "__scraper-token=" + TOKEN;
  assert.deepEqual(requests, [
    withToken(FORUM + URL_END),
    withToken(FORUM + "page-2" + URL_END),
    withToken(FORUM + "page-3" + URL_END),
    withToken(FORUM + "page-4" + URL_END),
    withToken(R1),
    withToken(R2),
    withToken(OTHER),
  ]);
});

test("stores plain URLs, trimmed listings and only each thread's first post", () => {
  const { spreadsheet, scripts } = appsScript({ sheets: { "OG Backstage": backstage("cup-one") }, pages: smogon() });
  scripts.fetchOGPages();
  const rows = rowsOf(spreadsheet);

  assert.deepEqual(rows[0], ["URL", "CONTENT"]);
  assert.deepEqual(rows.slice(1).map((r) => r[0]), [
    FORUM + URL_END,
    FORUM + "page-2" + URL_END,
    FORUM + "page-3" + URL_END,
    FORUM + "page-4" + URL_END,
    R1,
    R2,
  ]);
  assert.ok(!JSON.stringify(rows).includes(TOKEN), "the token was stored in the sheet");
  assert.equal(rows[1][1], forumListingPage([R1, R2, R1, OTHER]).match(/"[^"]*\/forums\/threads\/[^"]*"/g).join("\n"));
  assert.equal(rows[3][1] ?? "", "", "a missing (404) listing page is stored empty");
  assert.equal(scripts.firstMessage(scripts.readPage(R1, "OG Pages")), POST_1);
  assert.ok(!scripts.readPage(R1, "OG Pages").includes("a reply"));
  assert.deepEqual(spreadsheet.getSheetByName("OG Pages").numberFormats, ["@"], "pages must be written as plain text");
});

test("a trimmed listing yields the same round threads as the full page", () => {
  // Shaped like XenForo's thread list: preview/latest/page links, signups, an old cycle, other tours.
  const item = (slug) =>
    `<div class="structItem structItem--thread" data-author="host">` +
    `<div class="structItem-title"><a href="/forums/threads/${slug}/" data-tp-primary="on" data-xf-init="preview-tooltip" ` +
    `data-preview-url="/forums/threads/${slug}/preview">NU Cup Thread</a></div>` +
    `<span class="structItem-pageJump"><a href="/forums/threads/${slug}/page-2">2</a></span>` +
    `<a href="/forums/threads/${slug}/latest" rel="nofollow">Latest</a></div>`;
  const full =
    '<html><head><link rel="canonical" href="https://www.smogon.com/forums/forums/smogon-metagames-circuits.474/" /></head><body>' +
    ["adv-nu-cup-round-2.3776662", "dpp-nu-cup-round-1.3777564", "adv-nu-cup-signups.3775000", "adv-nu-cup-round-1.3776192", "adv-nu-cup-cycle-1.3700000", "adv-nu-cup-round-0.3600000"]
      .map(item)
      .join("\n") +
    '<a href="/forums/forums/smogon-metagames-circuits.474/page-2?prefix_id=412">Next</a></body></html>';

  const { scripts } = appsScript();
  const fromFull = scripts.extractURLs(full, "adv-nu-cup", '"', '"', 3776192);
  const fromTrimmed = scripts.extractURLs(scripts.trimListing(full), "adv-nu-cup", '"', '"', 3776192);
  assert.deepEqual(Array.from(fromFull), [SMOGON + "/forums/threads/adv-nu-cup-round-2.3776662/", SMOGON + "/forums/threads/adv-nu-cup-round-1.3776192/"]);
  assert.deepEqual(Array.from(fromTrimmed), Array.from(fromFull));
});

test("long pages are split into cell-sized rows and read back whole", () => {
  // "=" right at each split must not start a cell (Sheets could read it as a formula).
  const { scripts } = appsScript();
  const long = ("a".repeat(scripts.CELL_LIMIT) + "=+-@").repeat(3);
  const { spreadsheet, scripts: s2 } = appsScript({
    sheets: { "OG Backstage": backstage("cup-one") },
    pages: smogon({ [R2]: threadPage("<b>Rules</b>" + long) }),
  });
  s2.fetchOGPages();

  const parts = rowsOf(spreadsheet).filter((r) => r[0] === R2).map((r) => r[1]);
  assert.ok(parts.length > 1);
  for (const p of parts) {
    assert.ok(p.length <= 50000, `part of ${p.length} chars`);
    assert.ok(!"=+-@".includes(p[0]), `part starts with ${p[0]}`);
  }
  assert.equal(s2.firstMessage(s2.readPage(R2, "OG Pages")), "<b>Rules</b>" + long);
});

test("no token in the script properties: says where to add it, fetches nothing", () => {
  const { scripts, requests } = appsScript({ sheets: { "OG Backstage": backstage("cup-one") }, pages: smogon(), scriptToken: null });

  assert.throws(() => scripts.fetchOGPages(), /Project Settings > Script properties as SMOGON_SCRAPER_TOKEN/);
  assert.deepEqual(requests, []);
});

test("wrong token: names the page (not the token) and leaves the stored pages alone", () => {
  const stored = [["URL", "CONTENT"], [R1, "previous fetch"]];
  const { spreadsheet, scripts } = appsScript({
    sheets: { "OG Backstage": backstage("cup-one"), "OG Pages": stored },
    pages: smogon(),
    scriptToken: "expired-token",
  });

  assert.throws(
    () => scripts.fetchOGPages(),
    (e) => /Smogon returned its browser check for https:\/\/www\.smogon\.com\/forums\/forums\/smogon-metagames-circuits\.474\/\?prefix_id=412 - check the SMOGON_SCRAPER_TOKEN/.test(e.message) && !e.message.includes("expired-token"),
  );
  assert.deepEqual(rowsOf(spreadsheet), stored);
});

test("a missing round thread is an error, and the stored pages are left alone", () => {
  const stored = [["URL", "CONTENT"], [R1, "previous fetch"]];
  const pages = smogon();
  delete pages[R2];
  const { spreadsheet, scripts } = appsScript({ sheets: { "OG Backstage": backstage("cup-one"), "OG Pages": stored }, pages });

  assert.throws(() => scripts.fetchOGPages(), new RegExp("HTTP 404 fetching " + R2.replace(/[.?]/g, "\\$&")));
  assert.deepEqual(rowsOf(spreadsheet), stored);
});

test("a fetch replaces earlier pages, and a fill in the same run reads the new ones", () => {
  const { spreadsheet, scripts } = appsScript({
    sheets: { "OG Backstage": backstage("cup-one"), "OG Pages": [["URL", "CONTENT"], ["https://old/", "stale"]] },
    pages: smogon(),
  });
  assert.equal(scripts.readPage("https://old/", "OG Pages"), "stale");
  scripts.fetchOGPages();

  assert.ok(!rowsOf(spreadsheet).some((r) => r[0] === "https://old/"));
  assert.throws(() => scripts.readPage("https://old/", "OG Pages"), /Page not in "OG Pages"/);
  assert.equal(scripts.firstMessage(scripts.readPage(R2, "OG Pages")), POST_2);
});

test("readPage explains a missing pages sheet", () => {
  const { scripts } = appsScript();
  assert.throws(() => scripts.readPage("https://a/", "OG Pages"), /No "OG Pages" sheet - run this circuit's fetch first/);
});
