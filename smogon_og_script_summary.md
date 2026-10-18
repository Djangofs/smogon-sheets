# Smogon OG Tournament Standings Script — Summary

## Overview

This is a **Google Apps Script that automatically builds Pokémon Smogon tournament standings from forum tournament threads and writes the results into Google Sheets**.

The current version is specifically the **OG format** implementation. Its main job is to take a series of Smogon tournament-round URLs, determine which players participated and who won each round, convert that into a "round reached" value, convert the round reached into tournament points, and then combine those points across tournaments into an overall leaderboard.

## Overall flow

```text
Google Sheet configuration
        ↓
Find tournament round URLs
        ↓
Download each Smogon forum thread
        ↓
Extract the first tournament post
        ↓
Parse player names / IDs / winners
        ↓
Determine furthest round reached
        ↓
Convert round reached → tournament points
        ↓
Build tournament-level standings
        ↓
Combine tournament results
        ↓
Write overall leaderboard to Google Sheets
```

## 1. It parses Smogon tournament posts

`getOGRoundURLs()` obtains the URLs for the tournament rounds from the configured forum page. It also updates the URL cells in the backstage sheet.

For each round URL, `getOGPlayersForRound()`:

- downloads the Smogon page with `UrlFetchApp.fetch()`
- extracts the first forum post
- strips out some unwanted seeding information
- passes the remaining tournament bracket text to the OG player parser

## 2. It identifies players and winners

`getOGPlayersFromMessage()` is the core parser.

For each Smogon member link it extracts:

```text
[name, score, playerID, isWinner]
```

The player ID is taken from `data-user-id`, while the winner status is determined from the `[B]` marker in `data-username`.

It also uses the position of the word `"losers"` in the post to determine whether the player is in the losers/winners section, which affects the parser's internal `score`.

There is also logic to ignore players who appear in bracket positions but have not actually reached that round yet, using the underline and seeding information.

## 3. It processes each tournament

`getOGTournamentPlayerPoints()` takes all of the round URLs and processes them in reverse order so that the earliest tournament round is handled first.

For each round it:

- gets the players from the thread
- deduplicates players who appear multiple times in the same round
- keeps their player ID and name
- retains winner information
- identifies the final as the last round containing exactly two players
- calculates the highest round reached for each player

The important output from this function is effectively:

```text
[name, roundReached, playerID]
```

rather than the parser's intermediate score.

## 4. It converts round reached into tournament points

`fillOGSheet()` then takes each player's `roundReached` value and looks up the corresponding points from the **RoundPoints column in the OG Backstage sheet**.

The relevant logic is:

```js
rnd = roundValues[i][0] - 1;
pts = roundPoints[rnd][0];
```

So the spreadsheet controls the actual tournament scoring table; the script determines the player's finishing/round position and the sheet determines how many points that position is worth.

## 5. It creates tournament standings

For each tournament, the script constructs:

- player name
- round reached
- tournament points
- rank

It then writes those results to the tournament results sheet, along with the relevant round URLs.

## 6. It combines tournaments into an overall leaderboard

`addTournamentToTotal()` takes the current tournament's players and merges them into `finalPlayerSheet`.

Players are matched using their **Smogon player ID**, rather than their displayed name. That means a player changing their Smogon name can still be recognised as the same person.

The resulting structure is essentially:

```text
[name, playerID, totalPoints, tournament1Points, tournament2Points, ...]
```

Players who did not participate in a particular tournament receive an empty entry for that tournament.

## 7. It generates the final public leaderboard

`makeFinalSheet()` converts the internal combined structure into the final format that gets written to the main sheet.

It produces:

```text
Rank | Player | Total Points | [individual tournament scores...]
```

and calculates the overall ranking based on total points.

## Supporting functions

The rest of the script contains relatively small utility functions:

`findCut()` extracts text between two strings.

`isSubstringBetween()` / `isFirstSubstringBetween()` determine whether text occurs inside HTML delimiters.

`firstMessage()` extracts the first Smogon forum post.

`removeBullshit()` removes `(1)`, `(2)`, etc. used by bracket seeding.

`sortPlayers()` sorts by a numeric column and then player name.

`filterEmptyValues()` removes empty spreadsheet entries.

`deleteContentFrom()` clears existing sheet content before rebuilding it.

`getStartingColumns()` detects the tournament blocks configured across the backstage sheet.

## In one sentence

**The script is an automated Smogon tournament leaderboard generator: it scrapes OG tournament bracket posts, identifies players and match winners, determines how far each player progressed, converts that progression into points using a Google Sheet scoring table, and aggregates those points into tournament and overall standings.**

## Important architectural point

The **Smogon HTML parser and the spreadsheet scoring system are separate**: the parser determines tournament participation/results, while the `OG Backstage` sheet supplies the actual round-point values.
