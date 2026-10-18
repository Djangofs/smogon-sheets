// Small hand-built tournaments run through fillOGSheet end to end.
// Each scenario builds an OG Backstage sheet + Smogon round posts, then checks
// what lands in "OG Tournaments" and "OG Circuit".
const test = require("node:test");
const assert = require("node:assert/strict");
const { threadPage, addForumPages, runFillOGSheet, diffGrids, SMOGON } = require("./harness");

const FORUM = SMOGON + "/forums/forums/smogon-metagames-circuits.474/";
const URL_END = "?prefix_id=412";
const FIRST_THREAD = 3000000;

// ---------- Post builders ----------

const player = (id, name) => ({ id, name });

function link(p, mark) {
  const tag = mark === "win" ? "B" : mark === "lose" ? "S" : null;
  const username = tag ? `[${tag}]${p.name}[/${tag}]` : p.name;
  const text = tag ? `<${tag.toLowerCase()}>${p.name}</${tag.toLowerCase()}>` : p.name;
  return (
    `<a href="${SMOGON}/forums/members/${p.id}/" class="username" data-xf-init="member-tooltip" ` +
    `data-user-id="${p.id}" data-username="${username}">${text}</a>`
  );
}

// "A vs B", with the winner bolded and the loser struck through once decided.
function match(a, b, winner) {
  const mark = (p) => (!winner ? undefined : p === winner ? "win" : "lose");
  return `${link(a, mark(a))} vs ${link(b, mark(b))}`;
}

// "A vs (Winner of C vs D)" — C and D are still finishing the previous round.
function pending(a, [c, d]) {
  return `${link(a)} vs (Winner of ${link(c)} vs ${link(d)})`;
}

function post(...lines) {
  return threadPage(
    "<div>Art by someone</div><b>Tournament Rules:</b><ul><li>Best of three, single elimination.</li></ul><br />" +
      lines.join("<br />\n") +
      "<br /><b>Round deadline is: Sunday</b>"
  );
}

// ---------- Workbook builder ----------

// tournaments: [{ title, tourStr, points (top = winner, as in the sheet), rounds: [post, ...] oldest first }]
function buildWorkbook({ tournaments, renames = [], staleTours = [], staleCircuit = [] }) {
  const backstage = [
    ["NAME OF MAIN SHEET", "NAME OF TOUR SHEET"],
    ["OG Circuit", "OG Tournaments"],
    ["", "OLDEST THREAD NUMBER"],
    ["", FIRST_THREAD],
  ];
  const tourHeader = [[], []];
  const pages = {};
  const listing = [];
  const urlsByTour = [];
  let threadNo = FIRST_THREAD;

  tournaments.forEach((t, i) => {
    const col = 2 + i * 4; // 0-based: C, G, K, ...
    const set = (r, c, v) => {
      while (backstage.length <= r) backstage.push([]);
      while (backstage[r].length < c) backstage[r].push("");
      backstage[r][c] = v;
    };
    set(0, col, "FORUM URL"); set(0, col + 1, "TOUR STR"); set(0, col + 2, "DOUBLE ELIM");
    set(1, col, FORUM); set(1, col + 1, t.tourStr); set(1, col + 2, "No");
    set(3, col, "URL END"); set(3, col + 1, "TOURNAMENT URLS"); set(3, col + 2, "ROUND PTS");
    set(4, col, URL_END);
    t.points.forEach((pts, r) => set(4 + r, col + 2, pts));

    const urls = t.rounds.map((html, r) => {
      const url = `${SMOGON}/forums/threads/${t.tourStr}-round-${r + 1}.${++threadNo}/`;
      pages[url] = html;
      return url;
    });
    urlsByTour.push(urls.slice().reverse());
    listing.push(...urls.slice().reverse()); // forum lists newest first

    tourHeader[0][i * 5] = t.title;
    tourHeader[1].push("Links", "Rank", "Player", "Points", "");
  });

  renames.forEach(([from, to], i) => {
    while (backstage.length <= 5 + i) backstage.push([]);
    backstage[5 + i][0] = from;
    backstage[5 + i][1] = to;
  });

  addForumPages(pages, FORUM, URL_END, listing);
  const circuitHeader = ["Rank", "Player", "Total Points", "", ...tournaments.map((t) => t.title)];

  return {
    sheets: {
      "OG Backstage": backstage,
      "OG Tournaments": [...tourHeader.map((r) => Array.from(r, (v) => v ?? "")), ...staleTours],
      "OG Circuit": [circuitHeader, ...staleCircuit],
    },
    pages,
    urlsByTour,
  };
}

function run(workbook) {
  const { spreadsheet } = runFillOGSheet(workbook);
  return {
    spreadsheet,
    // Rows below the headers, as strings.
    tours: spreadsheet.getSheetByName("OG Tournaments").toStrings(3),
    circuit: spreadsheet.getSheetByName("OG Circuit").toStrings(2),
  };
}

const assertGrid = (actual, expected) =>
  assert.deepEqual(diffGrids(actual, expected.map((r) => r.map(String))), []);

// ---------- Players ----------

const alice = player(101, "Alice");
const bob = player(102, "Bob");
const cara = player(103, "Cara");
const dan = player(104, "Dan");
const eve = player(105, "Eve");
const finn = player(106, "Finn");
const gus = player(107, "Gus");
const hana = player(108, "Hana");

// ---------- Scenarios ----------

test("single elimination: finals winner gets the extra round, ties share a rank", () => {
  const wb = buildWorkbook({
    tournaments: [
      {
        title: "Cup One",
        tourStr: "cup-one",
        points: [100, 50, 0],
        rounds: [
          post(match(alice, bob, alice), match(cara, dan, cara)),
          post(match(alice, cara, alice)),
        ],
      },
    ],
  });
  const [finalUrl, r1Url] = wb.urlsByTour[0];
  const { tours, circuit } = run(wb);

  assertGrid(tours, [
    [finalUrl, 1, "Alice", 100],
    [r1Url, 2, "Cara", 50],
    ["", 3, "Bob", 0],
    ["", 3, "Dan", 0],
  ]);
  assertGrid(circuit, [
    [1, "Alice", 100, " ", 100],
    [2, "Cara", 50, " ", 50],
    [3, "Bob", 0, " ", 0],
    [3, "Dan", 0, " ", 0],
  ]);
});

test("unfinished final: neither finalist gets the winner's points", () => {
  const wb = buildWorkbook({
    tournaments: [
      {
        title: "Cup One",
        tourStr: "cup-one",
        points: [100, 50, 0],
        rounds: [
          post(match(alice, bob, alice), match(cara, dan, cara)),
          post(match(alice, cara)), // no result yet
        ],
      },
    ],
  });
  const { circuit } = run(wb);

  assertGrid(circuit, [
    [1, "Alice", 50, " ", 50],
    [1, "Cara", 50, " ", 50],
    [3, "Bob", 0, " ", 0],
    [3, "Dan", 0, " ", 0],
  ]);
});

test("pending match in parentheses: those players are not credited with the new round", () => {
  const wb = buildWorkbook({
    tournaments: [
      {
        title: "Cup One",
        tourStr: "cup-one",
        points: [100, 60, 30, 0],
        rounds: [
          post(match(alice, bob, alice), match(cara, dan), match(eve, finn, eve), match(gus, hana, gus)),
          post(pending(alice, [cara, dan]), match(eve, gus)),
        ],
      },
    ],
  });
  const { circuit } = run(wb);

  assertGrid(circuit, [
    [1, "Alice", 30, " ", 30],
    [1, "Eve", 30, " ", 30],
    [1, "Gus", 30, " ", 30],
    [4, "Bob", 0, " ", 0],
    [4, "Cara", 0, " ", 0],
    [4, "Dan", 0, " ", 0],
    [4, "Finn", 0, " ", 0],
    [4, "Hana", 0, " ", 0],
  ]);
});

test("two tournaments: totals are merged by Smogon ID and missing entries are blank", () => {
  const alicia = player(alice.id, "Alicia"); // Alice changed her forum name
  const wb = buildWorkbook({
    tournaments: [
      {
        title: "Cup One",
        tourStr: "cup-one",
        points: [100, 50, 0],
        rounds: [
          post(match(alice, bob, alice), match(cara, dan, cara)),
          post(match(alice, cara, alice)),
        ],
      },
      {
        title: "Cup Two",
        tourStr: "cup-two",
        points: [100, 50, 0],
        rounds: [
          post(match(alicia, eve, alicia), match(bob, cara, bob)),
          post(match(bob, alicia, bob)),
        ],
      },
    ],
  });
  const [t1Final, t1R1] = wb.urlsByTour[0];
  const [t2Final, t2R1] = wb.urlsByTour[1];
  const { tours, circuit } = run(wb);

  assertGrid(tours, [
    [t1Final, 1, "Alice", 100, "", t2Final, 1, "Bob", 100],
    [t1R1, 2, "Cara", 50, "", t2R1, 2, "Alicia", 50],
    ["", 3, "Bob", 0, "", "", 3, "Cara", 0],
    ["", 3, "Dan", 0, "", "", 3, "Eve", 0],
  ]);
  assertGrid(circuit, [
    [1, "Alicia", 150, " ", 100, 50],
    [2, "Bob", 100, " ", 0, 100],
    [3, "Cara", 50, " ", 50, 0],
    [4, "Dan", 0, " ", 0, ""],
    [4, "Eve", 0, " ", "", 0],
  ]);
});

test("stale rows from a previous run are cleared", () => {
  const wb = buildWorkbook({
    tournaments: [
      {
        title: "Cup One",
        tourStr: "cup-one",
        points: [100, 0],
        rounds: [post(match(alice, bob, alice))],
      },
    ],
    staleTours: Array.from({ length: 6 }, () => ["old-url", 9, "Ghost", 999, "", "x", 9, "Ghost", 999]),
    staleCircuit: Array.from({ length: 6 }, () => [9, "Ghost", 999, " ", 999, 999]),
  });
  const [url] = wb.urlsByTour[0];
  const { tours, circuit } = run(wb);

  assertGrid(tours, [
    [url, 1, "Alice", 100],
    ["", 2, "Bob", 0],
  ]);
  assertGrid(circuit, [
    [1, "Alice", 100, " ", 100],
    [2, "Bob", 0, " ", 0],
  ]);
});

// KNOWN BUG: OGCode.js assigns newNames[n] (a whole row, e.g. ["Robert"]) instead of
// newNames[n][0]. Remove `todo` once fixed so this becomes a regular test.
test("Backstage rename table replaces display names with a plain string", { todo: "rename writes an array into the cell" }, () => {
  const wb = buildWorkbook({
    tournaments: [
      {
        title: "Cup One",
        tourStr: "cup-one",
        points: [100, 0],
        rounds: [post(match(alice, bob, alice))],
      },
    ],
    renames: [["Bob", "Robert"]],
  });
  const { spreadsheet } = run(wb);

  const nameCell = spreadsheet.getSheetByName("OG Circuit").getRange(3, 2).getValue();
  assert.equal(nameCell, "Robert");
});
