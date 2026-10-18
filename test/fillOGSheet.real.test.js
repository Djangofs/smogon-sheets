// Golden-master test: real OG Backstage input + recorded Smogon posts must
// reproduce the published "OG Tournaments" and "OG Circuit" tabs.
// Re-record with `npm run record-fixtures` after the live sheet is regenerated.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadCsvGrid, FakeSheet, addForumPages, runFillOGSheet, diffGrids } = require("./harness");
const { fixtureName } = require("./record-fixtures");

const DIR = path.join(__dirname, "fixtures", "real");
const load = (f) => loadCsvGrid(path.join(DIR, f));

function buildRealInput() {
  const backstage = load("backstage.csv");
  const tournaments = load("tournaments.csv");
  const circuit = load("circuit.csv");

  // Output tabs start with only their header rows; the script fills the rest.
  const sheets = {
    "OG Backstage": backstage,
    "OG Tournaments": tournaments.slice(0, 2),
    "OG Circuit": circuit.slice(0, 1),
  };

  // Each block in Backstage row 1 is 4 columns wide starting at C:
  // [forum url, tour str, double elim, gap]; URLs live under "TOURNAMENT URLS" (D).
  // All tournaments share one forum, so their threads go onto one listing page
  // (newest first within each tournament, like the real forum).
  const pages = {};
  const listings = {};
  const bs = new FakeSheet("bs", backstage);
  for (let col = 3; bs._get(1, col) !== ""; col += 4) {
    const listingUrl = bs._get(2, col) + "\u0000" + bs._get(5, col);
    listings[listingUrl] = listings[listingUrl] || [];
    for (let r = 5; r <= bs.getLastRow(); r++) {
      const u = bs._get(r, col + 1);
      if (u === "") continue;
      listings[listingUrl].push(u);
      pages[u] = fs.readFileSync(path.join(DIR, "html", fixtureName(u)), "utf8");
    }
  }
  for (const [key, threadUrls] of Object.entries(listings)) {
    const [forumUrl, urlEnd] = key.split("\u0000");
    addForumPages(pages, forumUrl, urlEnd, threadUrls);
  }

  return { sheets, pages, expected: { tournaments, circuit, backstage } };
}

const trimRows = (grid, fromRow) => new FakeSheet("x", grid).toStrings(fromRow);

test("real data: fillOGSheet reproduces the published sheets", async (t) => {
  const { sheets, pages, expected } = buildRealInput();
  const { spreadsheet } = runFillOGSheet({ sheets, pages });

  await t.test("OG Tournaments", () => {
    assert.deepEqual(diffGrids(spreadsheet.getSheetByName("OG Tournaments").toStrings(), trimRows(expected.tournaments)), []);
  });

  await t.test("OG Circuit", () => {
    assert.deepEqual(diffGrids(spreadsheet.getSheetByName("OG Circuit").toStrings(), trimRows(expected.circuit)), []);
  });

  await t.test("OG Backstage URL columns are rewritten unchanged", () => {
    assert.deepEqual(diffGrids(spreadsheet.getSheetByName("OG Backstage").toStrings(), trimRows(expected.backstage)), []);
  });
});
