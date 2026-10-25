# smogon-sheets

Google Apps Script that builds Smogon NU circuit standings from tournament threads on the Smogon forums. For each circuit it works out how far every player got in each tournament, turns that into points using the table in the sheet, and writes per-tournament results plus an overall leaderboard.

There are two circuits in the same workbook, and they share all of their logic:

| Circuit | Config sheet | Pages sheet | Writes to |
|---|---|---|---|
| OG | `OG Backstage` | `OG Pages` | `OG Tournaments`, `OG Circuit` |
| CG | `CG Backstage` | `CG Pages` | `CG Tournaments`, `CG Circuit` |

The output sheet names come from cells A2 and B2 of each Backstage sheet.

Each circuit has three functions to run from the Apps Script editor:

| OG | CG | What it does |
|---|---|---|
| `fetchOGPages()` | `fetchPages()` | Downloads the forum pages from Smogon into the Pages sheet |
| `fillOGSheet()` | `fillSheet()` | Builds the standings from the Pages sheet; doesn't touch Smogon |
| `updateOGSheet()` | `updateSheet()` | Both, one after the other |

## Files

```
Shared.js   All the logic: fetching pages (fetchCircuitPages), parsing posts, scoring, writing sheets (fillCircuit)
OGCode.js   fetchOGPages / fillOGSheet / updateOGSheet -> "OG Backstage", "OG Pages"
Code.js     fetchPages   / fillSheet   / updateSheet   -> "CG Backstage", "CG Pages"
test/       Node tests that run the Apps Script files unmodified
```

`Shared.js`, `OGCode.js` and `Code.js` are the three files in the Apps Script project. **Apps Script puts every file's functions in one global namespace.** That's why the two entry files contain nothing but their entry points. If a function were defined in two files, whichever file loaded last would silently win. Put new logic in `Shared.js` so it applies to both circuits.

## How a run works

**Fetching** (`fetchCircuitPages(backstageSheet, pagesSheet)` in `Shared.js`):

1. Reads the tournament blocks from Backstage and downloads each forum's first 4 listing pages, keeping only the thread links.
2. Finds each tournament's round threads in those links (`extractURLs`, see below) and downloads them, 10 at a time with `UrlFetchApp.fetchAll`, keeping only each thread's first post.
3. Replaces the Pages sheet with `[URL, CONTENT]` rows, written as plain text. A page longer than one cell (50,000 characters) is split across several rows with the same URL.
   - Every request has `__scraper-token=<token>` added. Smogon lets those requests through its browser check.
   - The Pages sheet stores plain URLs, never the token.
   - Nothing is written until everything has downloaded. If any page fails (no token, a check page, an HTTP error), the error names the page and the old Pages sheet is left as it was.

**Filling** (`fillCircuit(backstageSheet, pagesSheet)` in `Shared.js`) reads only from the Pages sheet:

1. **Find the round threads.** For each tournament block in Backstage, it reads the forum listing pages and picks out the threads whose URL contains the tournament's string (`extractURLs`). Sign-up, `page-` and `cycle` threads are skipped, and so are threads older than the oldest thread number.
   - The rounds are sorted by **thread number**, newest first. The forum sorts by latest reply, so its order can't be trusted.
   - The sorted URLs are written back to the block's URL column.
2. **Parse each round's first post** (`getPlayersForRound`, `getPlayersFromMessage`). Every Smogon member link becomes `[name, score, id, isWinner]`.
   - A bolded name (`data-username="[B]…"`) is the winner of that match.
   - Players above the word "losers" are in the winners bracket.
   - Players in a match that hasn't been played yet, like `(Winner of A vs B)`, aren't counted for that round, unless their name is underlined.
   - A seeding list before the matchups is skipped. Parsing starts at the player link just before the first "vs".
3. **Work out how far each player got** (`getTournamentPlayerPoints`). Each player's round reached is the last round they appear in. The winner of a finished final gets one extra round.
   - In a **double-elimination** tournament, a losers-bracket player who doesn't win in round 2 has lost twice. Their round reached is 0, which is worth 0 points.
   - Also in double elimination: when a round is followed by a losers-only round (nobody above the "losers" heading), that round's winners-bracket winners sit it out. They're credited straight away with the next full round, which they're guaranteed to play, so a losers round in progress never puts the losers bracket ahead of them.
4. **Score it.** Round reached *r* earns the *r*-th value from the **bottom** of the block's points column.
5. **Write the results.** Each tournament's rank, player and points go to the Tournaments sheet.
   - Players are merged across tournaments by **Smogon user ID**, not name, so a name change doesn't split anyone's points.
   - The rename table is applied.
   - The leaderboard is written to the Circuit sheet.

## Sheet layout

**Backstage** (`OG Backstage` / `CG Backstage`):

| Cell | Contents |
|---|---|
| A2 | Name of the circuit (leaderboard) sheet |
| B2 | Name of the tournaments sheet |
| B4 | Oldest thread number; older threads are ignored |
| A6:B | Rename table: name on Smogon → name to show |

Each tournament is a block of 4 columns, starting at C. The blocks stop at the first empty cell in row 1.

| Row | 1st column (C) | 2nd (D) | 3rd (E) | 4th |
|---|---|---|---|---|
| 1 | `FORUM URL` | `TOUR STR` | `DOUBLE ELIM` | (gap) |
| 2 | forum URL | string in the thread URLs, e.g. `adv-nu-cup` | `Yes` / `No` | |
| 4 | `URL END` | `TOURNAMENT URLS` | `ROUND PTS` | |
| 5+ | URL suffix, e.g. `?prefix_id=412` (row 5 only) | round URLs, newest first (**written by the script**) | points, winner at the top | |

The points column is read **from the bottom up**: the bottom value is for round 1. The winner of the final reaches one round more than the number of round threads, so a tournament with *n* rounds needs *n* + 1 values. For example, Classic Masters has 14 rounds and 15 values ending `…, 40, 35, 0, 0`.

**Tournaments sheet:** 5 columns per tournament (Links, Rank, Player, Points, gap), filled from row 3.

**Circuit sheet:** Rank, Player, Total Points, a blank column, then one column per tournament, filled from row 2.

## Setup

1. In the Apps Script project, add the three files `Shared`, `OGCode` and `Code` with the contents of `Shared.js`, `OGCode.js` and `Code.js`.
2. Add the Smogon scraper token under **Project Settings → Script properties** as `SMOGON_SCRAPER_TOKEN`. Keep it out of the code and the sheets: anyone who can view the workbook can read the sheets.
3. Run `updateOGSheet` or `updateSheet`. The first run asks for permission to reach external sites (Smogon) and to edit the spreadsheet. The Pages sheets are created if they don't exist.

If a fetch fails with "Smogon returned its browser check", the token is missing, wrong or expired.

## Tests

```sh
npm test
```

No dependencies; this uses Node's built-in test runner (Node 20+). `test/harness.js` loads `Shared.js`, `OGCode.js` and `Code.js` into one sandbox, like Apps Script's shared namespace. It uses in-memory stand-ins for the spreadsheet, `PropertiesService`, and a fake Smogon (`UrlFetchApp`) that serves a test's pages only to requests carrying the right token.

- **`scenarios.test.js`:** small hand-built tournaments, each run end to end (fetch, then fill) through **both** `updateOGSheet` and `updateSheet`. They cover finals, unfinished rounds, pending matches, double elimination, byes, seeding lists, late replies, renames and stale rows. There are also tests that each circuit only touches its own sheets.
- **`fillOGSheet.real.test.js`:** real OG Backstage input plus saved Smogon posts (`test/fixtures/real/`) must reproduce the saved Tournaments and Circuit sheets exactly. If you change scoring on purpose, check the difference and then update those CSVs. There is no real-data test for CG yet.
- **`fetch.test.js`:** fetching. It checks the requests made and what's stored, splitting long pages, and the errors for a missing or wrong token or a missing page.

`SMOGON_SCRAPER_TOKEN=<token> npm run record-fixtures` re-downloads the real OG data from the live sheet and Smogon.
