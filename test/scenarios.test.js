// Small hand-built tournaments run end to end through both circuits' entry points.
// Each scenario builds a Backstage sheet + Smogon round posts, runs the circuit's update
// (fetch pages, then fill) and checks what lands in the Tournaments and Circuit sheets.
// circuitTest() runs it once for OG and once for CG.
const test = require("node:test");
const assert = require("node:assert/strict");
const { threadPage, forumListingPage, addForumPages, runCircuit, appsScript, diffGrids, SMOGON } = require("./harness");

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

// ---------- Circuits ----------

const CIRCUITS = [
  { name: "OG", entry: "updateOGSheet", backstage: "OG Backstage", tours: "OG Tournaments", circuit: "OG Circuit", pages: "OG Pages" },
  { name: "CG", entry: "updateSheet", backstage: "CG Backstage", tours: "CG Tournaments", circuit: "CG Circuit", pages: "CG Pages" },
];

function circuitTest(name, fn) {
  for (const c of CIRCUITS) test(`${c.name}: ${name}`, () => fn(c));
}

// ---------- Workbook builder ----------

// tournaments: [{ title, tourStr, points (top = winner, as in the sheet), rounds: [post, ...] oldest first, doubleElim? }]
function buildWorkbook({ circuit = CIRCUITS[0], tournaments, renames = [], staleTours = [], staleCircuit = [] }) {
  const backstage = [
    ["NAME OF MAIN SHEET", "NAME OF TOUR SHEET"],
    [circuit.circuit, circuit.tours],
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
    set(1, col, FORUM); set(1, col + 1, t.tourStr); set(1, col + 2, t.doubleElim ? "Yes" : "No");
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
      [circuit.backstage]: backstage,
      [circuit.tours]: [...tourHeader.map((r) => Array.from(r, (v) => v ?? "")), ...staleTours],
      [circuit.circuit]: [circuitHeader, ...staleCircuit],
    },
    pages,
    urlsByTour,
    circuit,
  };
}

function run(workbook) {
  const c = workbook.circuit;
  const { spreadsheet } = runCircuit(workbook, { entry: c.entry });
  return {
    spreadsheet,
    // Rows below the headers, as strings.
    tours: spreadsheet.getSheetByName(c.tours).toStrings(3),
    circuit: spreadsheet.getSheetByName(c.circuit).toStrings(2),
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

circuitTest("single elimination: finals winner gets the extra round, ties share a rank", (c) => {
  const wb = buildWorkbook({
    circuit: c,
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

circuitTest("unfinished final: neither finalist gets the winner's points", (c) => {
  const wb = buildWorkbook({
    circuit: c,
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

circuitTest("late reply bumps an old round to the top of the forum: rounds still go in thread order", (c) => {
  const wb = buildWorkbook({
    circuit: c,
    tournaments: [
      {
        title: "Cup One",
        tourStr: "cup-one",
        points: [100, 60, 30, 0],
        rounds: [
          post(match(alice, bob, alice), match(cara, dan, cara), match(eve, finn, eve), match(gus, hana, gus)),
          post(match(alice, cara, alice), match(eve, gus, eve)),
          post(match(alice, eve, alice)),
        ],
      },
    ],
  });
  // The forum sorts by latest reply: round 1 got a late post, so it's listed first.
  const [finalUrl, r2Url, r1Url] = wb.urlsByTour[0];
  wb.pages[FORUM + URL_END] = forumListingPage([r1Url, finalUrl, r2Url]);
  const { tours, spreadsheet } = run(wb);

  assertGrid(tours, [
    [finalUrl, 1, "Alice", 100],
    [r2Url, 2, "Eve", 60],
    [r1Url, 3, "Cara", 30],
    ["", 3, "Gus", 30],
    ["", 5, "Bob", 0],
    ["", 5, "Dan", 0],
    ["", 5, "Finn", 0],
    ["", 5, "Hana", 0],
  ]);
  // Backstage lists the rounds newest first, too.
  assert.deepEqual(spreadsheet.getSheetByName(c.backstage).toStrings(5).map((r) => r[3]).filter(Boolean), [finalUrl, r2Url, r1Url]);
});

circuitTest("pending match in parentheses: those players are not credited with the new round", (c) => {
  const wb = buildWorkbook({
    circuit: c,
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

circuitTest("two tournaments: totals are merged by Smogon ID and missing entries are blank", (c) => {
  const alicia = player(alice.id, "Alicia"); // Alice changed her forum name
  const wb = buildWorkbook({
    circuit: c,
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

circuitTest("stale rows from a previous run are cleared", (c) => {
  const wb = buildWorkbook({
    circuit: c,
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

circuitTest("Backstage rename table replaces display names with a plain string", (c) => {
  const wb = buildWorkbook({
    circuit: c,
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

  const nameCell = spreadsheet.getSheetByName(c.circuit).getRange(3, 2).getValue();
  assert.equal(nameCell, "Robert");
});

// ---------- Double elimination ----------

circuitTest("double elimination: losing twice by round 2 is worth 0, whatever the points table says", (c) => {
  const wb = buildWorkbook({
    circuit: c,
    tournaments: [
      {
        title: "Masters",
        tourStr: "masters",
        doubleElim: true,
        points: [100, 60, 30, 10, 5],
        rounds: [
          post(match(alice, bob, alice), match(cara, dan, cara)),
          post("<b>Winners bracket</b>", match(alice, cara, alice), "<b>Losers bracket</b>", match(bob, dan, bob)),
          post("<b>Losers bracket</b>", match(cara, bob, cara)),
          post(match(alice, cara, alice)),
        ],
      },
    ],
  });
  const { tours } = run(wb);

  assert.deepEqual(tours.map((r) => r.slice(2)), [
    ["Alice", "100"],
    ["Cara", "60"],
    ["Bob", "30"],
    ["Dan", "0"],
  ]);
});

circuitTest("double elimination, losers round in progress: winners-bracket winners stay ahead of it", (c) => {
  const wb = buildWorkbook({
    circuit: c,
    tournaments: [
      {
        title: "Masters",
        tourStr: "masters",
        doubleElim: true,
        points: [100, 60, 30, 10, 5],
        rounds: [
          post(match(alice, bob, alice), match(cara, dan, cara)),
          post("<b>Winners bracket</b>", match(alice, cara, alice), "<b>Losers bracket</b>", match(bob, dan, bob)),
          post("<b>Losers bracket</b>", match(cara, bob)), // not played yet
        ],
      },
    ],
  });
  const { tours } = run(wb);

  // Alice sits out the losers round but is guaranteed a place in round 4 (the final).
  assert.deepEqual(tours.map((r) => r.slice(2)), [
    ["Alice", "60"],
    ["Bob", "30"],
    ["Cara", "30"],
    ["Dan", "0"],
  ]);
});

circuitTest("single elimination with byes: round 2 losers keep their points", (c) => {
  // Round 2 has more than half of round 1's players (Gus had a bye) - not a sign of double elimination.
  const wb = buildWorkbook({
    circuit: c,
    tournaments: [
      {
        title: "Cup One",
        tourStr: "cup-one",
        points: [100, 60, 30, 0],
        rounds: [
          post(match(alice, bob, alice), match(cara, dan, cara), match(eve, finn, eve)),
          post(match(alice, cara, alice), match(eve, gus, gus)),
          post(match(alice, gus, alice)),
        ],
      },
    ],
  });
  const { tours } = run(wb);

  assert.deepEqual(tours.map((r) => r.slice(2)), [
    ["Alice", "100"],
    ["Gus", "60"],
    ["Cara", "30"],
    ["Eve", "30"],
    ["Bob", "0"],
    ["Dan", "0"],
    ["Finn", "0"],
  ]);
});

circuitTest("seeding list before the matchups: eliminated seeds are not credited with the round", (c) => {
  const seeds = [alice, bob, cara, dan].map((p, i) => `${i + 1}. ${link(p)}`);
  const wb = buildWorkbook({
    circuit: c,
    tournaments: [
      {
        title: "Cup One",
        tourStr: "cup-one",
        points: [100, 50, 0],
        rounds: [
          post(...seeds, match(alice, bob, alice), match(cara, dan, cara)),
          post(...seeds, match(alice, cara, alice)),
        ],
      },
    ],
  });
  const { tours } = run(wb);

  assert.deepEqual(tours.map((r) => r.slice(2)), [
    ["Alice", "100"],
    ["Cara", "50"],
    ["Bob", "0"],
    ["Dan", "0"],
  ]);
});

// ---------- Keeping the circuits apart ----------

// One workbook holding both circuits, whose tournaments share a forum (and so its listing page).
function bothCircuits() {
  const og = buildWorkbook({
    circuit: CIRCUITS[0],
    tournaments: [{ title: "OG Cup", tourStr: "og-cup", points: [100, 0], rounds: [post(match(alice, bob, alice))] }],
  });
  const cg = buildWorkbook({
    circuit: CIRCUITS[1],
    tournaments: [{ title: "CG Cup", tourStr: "cg-cup", points: [70, 7], rounds: [post(match(cara, dan, dan))] }],
  });
  const pages = { ...og.pages, ...cg.pages };
  pages[FORUM + URL_END] = forumListingPage([...og.urlsByTour[0], ...cg.urlsByTour[0]]);
  return { og, cg, ...appsScript({ sheets: { ...og.sheets, ...cg.sheets }, pages }) };
}

const pageUrls = (sheet) => [...new Set(sheet.toStrings(2).map((r) => r[0]))];

test("OG and CG in one workbook: each update reads and writes only its own sheets", () => {
  const { og, cg, spreadsheet, scripts } = bothCircuits();
  const ogBefore = spreadsheet.getSheetByName("OG Circuit").toStrings();

  scripts.updateSheet();
  assert.equal(spreadsheet.getSheetByName("OG Pages"), null, "updateSheet created OG Pages");
  assert.deepEqual(spreadsheet.getSheetByName("OG Circuit").toStrings(), ogBefore, "updateSheet touched OG Circuit");
  assert.ok(pageUrls(spreadsheet.getSheetByName("CG Pages")).includes(cg.urlsByTour[0][0]));
  assert.ok(!pageUrls(spreadsheet.getSheetByName("CG Pages")).includes(og.urlsByTour[0][0]), "CG Pages has an OG thread");
  assertGrid(spreadsheet.getSheetByName("CG Circuit").toStrings(2), [
    [1, "Dan", 70, " ", 70],
    [2, "Cara", 7, " ", 7],
  ]);

  scripts.updateOGSheet();
  assert.ok(!pageUrls(spreadsheet.getSheetByName("OG Pages")).includes(cg.urlsByTour[0][0]), "OG Pages has a CG thread");
  assertGrid(spreadsheet.getSheetByName("OG Circuit").toStrings(2), [
    [1, "Alice", 100, " ", 100],
    [2, "Bob", 0, " ", 0],
  ]);
  assertGrid(spreadsheet.getSheetByName("CG Circuit").toStrings(2), [
    [1, "Dan", 70, " ", 70],
    [2, "Cara", 7, " ", 7],
  ]);
});

test("CG: fillSheet before fetchPages says to fetch, even if OG Pages has been fetched", () => {
  const { scripts } = bothCircuits();
  scripts.updateOGSheet();

  assert.throws(() => scripts.fillSheet(), /No "CG Pages" sheet .*fetchPages/);
});

test("fetch and fill can run separately: fillOGSheet uses the pages fetchOGPages stored", () => {
  const { spreadsheet, scripts, requests } = bothCircuits();
  scripts.fetchOGPages();
  const fetched = requests.length;
  scripts.fillOGSheet();

  assert.equal(requests.length, fetched, "fillOGSheet fetched from Smogon");
  assertGrid(spreadsheet.getSheetByName("OG Circuit").toStrings(2), [
    [1, "Alice", 100, " ", 100],
    [2, "Bob", 0, " ", 0],
  ]);
});
