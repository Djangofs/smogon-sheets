// Shared standings logic for every circuit. Each circuit's file only says which sheets to use:
//   OGCode.js: fetchOGPages() / fillOGSheet() / updateOGSheet() -> "OG Backstage", "OG Pages"
//   Code.js:   fetchPages()   / fillSheet()   / updateSheet()   -> "CG Backstage", "CG Pages"
// Apps Script puts all files in one global namespace, so these functions must exist only here.

function findCut(text, startStr, endStr, searchFrom) {
  // Return a cut of text, begins with (not including) startStr, ends with (not including) endStr, uses "indexOf" from int searchFrom
  var start = text.indexOf(startStr, searchFrom);
  if (start == -1) {
    return null;
  }
  var end = text.indexOf(endStr, start);
  if (end == -1) {
    return null;
  } else {
    return text.substring(start + startStr.length, end);
  }
}
function isFirstSubstringBetween(text, contains, begin, end) {
  var indexOfContains = text.indexOf(contains);
  var indexOfBegin = findLastIndex(text, begin, indexOfContains); //Finds last index of "begin" before "contains"
  var indexOfEnd = text.indexOf(end, indexOfBegin); //If there's string "end" between the two, this "contains" is not betwee begin and end - so this searches from begin
  if (indexOfBegin !== -1 && indexOfBegin < indexOfContains && indexOfContains < indexOfEnd) {
    var indexOfNextBegin = text.indexOf(begin, indexOfContains + 1);
    if (indexOfNextBegin == -1 || indexOfNextBegin > indexOfEnd) {
      return true;
    }
  }
  return false;
}
// Highest substring index before an input positition
function findLastIndex(text, substring, position) {
  var lastIndex = text.lastIndexOf(substring, position);
  return lastIndex !== -1 ? lastIndex : text.indexOf(substring);
}
function firstMessage(htmlStr) {
  try {
    // Find first message
    var message = findCut(htmlStr, '<article class="message', '</article>', 0);
    // Find the actual content of the message
    var content = findCut(message, '<div class="bbWrapper">', '<div class="js-selectToQuoteEnd', 0);
    return content;
  } catch (e) {
    console.error("Chyba: " + e);
    return null;
  }
}
function removeBullshit(message){
  for (var b = 1; b <= 34; b++){ //seeding bullshit: (1), (2), ...
    message = message.replace("(" + b + ")", '');
  }
  return message;
}

// ---------- Pages ----------

// Each circuit has a pages sheet of [url, content] rows (long pages span several rows with the same url).
// fetchCircuitPages() fills it from Smogon; fillCircuit() reads only from it, via readPage().
var TOKEN_PROPERTY = "SMOGON_SCRAPER_TOKEN";
var CELL_LIMIT = 45000; // Sheets allows 50,000 characters per cell
var FETCH_BATCH = 10; // parallel requests per UrlFetchApp.fetchAll

var pageCaches = {};
function readPage(url, pagesSheetName) {
  if (!(pagesSheetName in pageCaches)) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(pagesSheetName);
    if (!sheet) {
      throw new Error('No "' + pagesSheetName + '" sheet - run this circuit\'s fetch first (fetchOGPages for OG, fetchPages for CG)');
    }
    var cache = new Map();
    var lastRow = sheet.getLastRow();
    var rows = lastRow > 0 ? sheet.getRange(1, 1, lastRow, 2).getValues() : [];
    for (var i = 0; i < rows.length; i++) {
      var rowUrl = String(rows[i][0]);
      if (rowUrl === "" || rowUrl === "URL") continue;
      cache.set(rowUrl, (cache.get(rowUrl) || "") + String(rows[i][1]));
    }
    pageCaches[pagesSheetName] = cache;
  }
  var pages = pageCaches[pagesSheetName];
  if (!pages.has(url)) {
    throw new Error('Page not in "' + pagesSheetName + '": ' + url + ' - run this circuit\'s fetch again (fetchOGPages for OG, fetchPages for CG)');
  }
  return pages.get(url);
}

// The forum listing pages a tournament's threads are found on - "four pages should be enough for a year".
function listingUrlsFor(forum, urlEnd) {
  var urls = [forum + urlEnd];
  for (var n = 2; n <= 4; n++) {
    urls.push(forum + "page-" + n + urlEnd);
  }
  return urls;
}

// Every quoted value pointing at a thread, in page order - all extractURLs() needs from a listing page.
function trimListing(html) {
  var values = html.match(/"[^"]*\/forums\/threads\/[^"]*"/g) || [];
  return values.join("\n");
}
// Keeps only the first post, in the minimal markup firstMessage() looks for.
function wrapPost(content) {
  return '<article class="message"><div class="bbWrapper">' + content + '<div class="js-selectToQuoteEnd"></div></article>';
}
// Splits content into cell-sized parts; no part starts with a character Sheets could read as a formula.
function splitForCells(content) {
  var parts = [];
  var start = 0;
  while (content.length - start > CELL_LIMIT) {
    var end = start + CELL_LIMIT;
    while ("=+-@".indexOf(content[end]) !== -1) end--;
    parts.push(content.slice(start, end));
    start = end;
  }
  parts.push(content.slice(start));
  return parts;
}

function scraperToken() {
  var token = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY);
  if (!token) {
    throw new Error("No Smogon scraper token - add it in Apps Script under Project Settings > Script properties as " + TOKEN_PROPERTY);
  }
  return token;
}
function withToken(url, token) {
  return url + (url.indexOf("?") === -1 ? "?" : "&") + "__scraper-token=" + encodeURIComponent(token);
}
// Fetches urls with the token, FETCH_BATCH at a time, and returns their texts in order.
// Errors name the plain url, never the token. allow404 turns a missing page into "".
function fetchSmogonPages(urls, token, allow404) {
  var texts = [];
  for (var b = 0; b < urls.length; b += FETCH_BATCH) {
    var batch = urls.slice(b, b + FETCH_BATCH);
    var responses = UrlFetchApp.fetchAll(batch.map(function (url) {
      return { url: withToken(url, token), muteHttpExceptions: true };
    }));
    for (var i = 0; i < responses.length; i++) {
      var code = responses[i].getResponseCode();
      var text = responses[i].getContentText();
      if (text.indexOf("xf_smogon_gate") !== -1) {
        throw new Error("Smogon returned its browser check for " + batch[i] + " - check the " + TOKEN_PROPERTY + " script property");
      }
      if (code === 404 && allow404) {
        texts.push("");
      } else if (code < 200 || code >= 300) {
        throw new Error("HTTP " + code + " fetching " + batch[i]);
      } else {
        texts.push(text);
      }
    }
  }
  return texts;
}
// Downloads every listing page and round thread the circuit's Backstage needs and replaces the
// pages sheet with them. The sheet is only written once everything has been fetched.
function fetchCircuitPages(backstageSheetName, pagesSheetName) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(backstageSheetName);
  var token = scraperToken();
  var firstThreadNumber = sheet.getRange(4,2).getValue();
  var blocks = getStartingColumns(sheet,1,3,4).map(function (col) {
    return {
      listingUrls: listingUrlsFor(sheet.getRange(2,col).getValue(), sheet.getRange(5,col).getValue()),
      tourStr: sheet.getRange(2,col+1).getValue(),
    };
  });
  var pages = new Map(); // url -> content to store, in fetch order

  var listingUrls = [];
  blocks.forEach(function (block) {
    block.listingUrls.forEach(function (url) {
      if (listingUrls.indexOf(url) === -1) listingUrls.push(url);
    });
  });
  fetchSmogonPages(listingUrls, token, true).forEach(function (html, i) {
    pages.set(listingUrls[i], trimListing(html));
  });

  var threadUrls = [];
  blocks.forEach(function (block) {
    var listing = block.listingUrls.map(function (url) { return pages.get(url); }).join("");
    extractURLs(listing, block.tourStr, '"', '"', firstThreadNumber).forEach(function (url) {
      if (threadUrls.indexOf(url) === -1) threadUrls.push(url);
    });
  });
  fetchSmogonPages(threadUrls, token, false).forEach(function (html, i) {
    var post = firstMessage(html);
    if (post === null) {
      throw new Error("No first post found in " + threadUrls[i]);
    }
    pages.set(threadUrls[i], wrapPost(post));
  });

  var rows = [["URL", "CONTENT"]];
  pages.forEach(function (content, url) {
    splitForCells(content).forEach(function (part) {
      rows.push([url, part]);
    });
  });
  var pagesSheet = spreadsheet.getSheetByName(pagesSheetName) || spreadsheet.insertSheet(pagesSheetName);
  pagesSheet.clearContents();
  pagesSheet.getRange(1, 1, rows.length, 2).setNumberFormat("@").setValues(rows); // plain text: never parsed as formulas
  delete pageCaches[pagesSheetName]; // a fill in the same run must read the new pages
  console.log(pagesSheetName + ": " + listingUrls.length + " listing pages, " + threadUrls.length + " round threads");
}

// ---------- Parsing round posts ----------

// Every Smogon member link in a round post, as [name, score, id, isWinner, aboveLosers].
// aboveLosers: above the word "losers", i.e. in the winners bracket.
// score: +1 for a winner, +1 for being above "losers", +1 for both.
function getPlayersFromMessage(message) {
  var memberStart = '<a href="https://www.smogon.com/forums/members/';
  var players = [];
  var prmes = message; // text from the previous player on, used for the pending-match check
  while (true) {
    var tagStart = message.indexOf(memberStart);
    if (tagStart === -1) {
      return players;
    }
    var openingTagEnd = message.indexOf(">", tagStart);
    var closingTag = message.indexOf("</a>", openingTagEnd);
    if (openingTagEnd === -1 || closingTag === -1) {
      return players;
    }
    var anchorTag = message.substring(tagStart, openingTagEnd + 1);
    var playerIDMatch = anchorTag.match(/data-user-id="([^"]+)"/);
    var playerID = playerIDMatch ? playerIDMatch[1] : null;
    var playerText = message.substring(openingTagEnd + 1, closingTag).replace(/<\/?[bus]>/g, "").trim();

    // "A vs (Winner of B vs C)": B and C are between ( ) and not underlined, so not in this round yet
    if (isFirstSubstringBetween(prmes, playerText, "(", ")") && !isFirstSubstringBetween(message, playerText, "<u>", "</u>")) {
      message = message.slice(tagStart + 1);
      continue;
    }

    // Smogon marks a bolded name as data-username="[B]Name[/B]"
    var isWinner = anchorTag.indexOf('data-username="[B]') !== -1;
    var losersCutoff = message.toLowerCase().indexOf("losers");
    var aboveLosers = losersCutoff !== -1 && losersCutoff > tagStart; // winners bracket ~~ round ahead
    var score = (isWinner ? 1 : 0) + (aboveLosers ? 1 : 0) + (isWinner && aboveLosers ? 1 : 0);

    players.push([playerText, score, playerID, isWinner, aboveLosers]);
    prmes = message;
    message = message.slice(tagStart + 1);
  }
}
function getPlayersForRound(url, pagesSheetName) {
  var message = firstMessage(readPage(url, pagesSheetName));
  if (message === null) {
    throw new Error("No first post found in " + url);
  }
  var roundCutoff = message.indexOf("Rules");
  if (message.indexOf("tournament-rules-and-general-guidelines") > 1) {
    roundCutoff = message.indexOf("tournament-rules-and-general-guidelines");
  }
  if (roundCutoff === -1) {
    roundCutoff = 0;
  }
  message = message.slice(roundCutoff); //This should get rid of most of the artists
  message = removeBullshit(message);
  // Newer threads list every seed before the matchups. Start at the player link right before the
  // first "vs" (Smogon may use narrow no-break spaces around it, hence \s).
  var vsMatch = message.match(/\s+vs\s+/i);
  if (vsMatch) {
    var firstPlayerStart = message.lastIndexOf('<a href="https://www.smogon.com/forums/members/', vsMatch.index);
    if (firstPlayerStart !== -1) {
      message = message.slice(firstPlayerStart);
    }
  } else {
    console.log("No matchups found in " + url);
  }
  return getPlayersFromMessage(message);
}

// ---------- Tournament results ----------

// urls are newest round first. Returns [[name, roundReached, id]]; roundReached 0 means
// the player lost twice by round 2 of a double-elimination tournament (0 points).
function getTournamentPlayerPoints(urls, pagesSheetName, doubleElim) {
  urls = urls.slice().reverse();
  // Each round's players, deduplicated by ID: [name, score, id, isWinner, aboveLosers, winnersBracketWin]
  var rounds = urls.map(function (url) {
    var seenThisRound = new Map();
    getPlayersForRound(url, pagesSheetName).forEach(function (player) {
      var winnersBracketWin = player[3] && player[4];
      var existing = seenThisRound.get(player[2]);
      if (!existing) {
        seenThisRound.set(player[2], player.concat([winnersBracketWin]));
      } else {
        existing[1] = Math.min(existing[1], player[1]);
        existing[3] = existing[3] || player[3]; // winner if either copy was bolded
        existing[4] = existing[4] || player[4];
        existing[5] = existing[5] || winnersBracketWin;
      }
    });
    return seenThisRound;
  });
  // A double-elimination round with nobody above the "losers" heading has only losers-bracket matches
  function isLosersOnly(round) {
    if (!doubleElim || round >= rounds.length) {
      return false;
    }
    return !Array.from(rounds[round].values()).some(function (p) { return p[4]; });
  }

  var playersMap = new Map();
  rounds.forEach(function (seenThisRound, round) {
    var isFinal = round === rounds.length - 1 && seenThisRound.size === 2;
    seenThisRound.forEach(function (p) {
      var name = p[0], score = p[1], id = p[2], isWinner = p[3], winnersBracketWin = p[5];
      // Double elimination round 2: a losers-bracket player (score 0) who didn't win has lost twice
      if (doubleElim && round === 1 && score === 0 && !isWinner) {
        playersMap.set(id, [name, 0, id]);
        return;
      }
      var roundReached = round + 1;
      // Only the actual winner of a completed final gets the extra round
      if (isFinal && isWinner) {
        roundReached++;
      }
      // Winners-bracket winners sit out a following losers-only round. Credit them now with the next
      // full round, which they're guaranteed to play, so the losers round doesn't overtake them.
      if (winnersBracketWin && isLosersOnly(round + 1)) {
        roundReached = round + 3;
      }
      if (!playersMap.has(id) || roundReached > playersMap.get(id)[1]) {
        playersMap.set(id, [name, roundReached, id]);
      }
    });
  });
  return Array.from(playersMap.values());
}
function sortPlayers(players, numbers, names) {
  players.sort(function (a, b) {
    // by numbers, then alphabetically
    var firstComparison = b[numbers] - a[numbers];
    if (firstComparison !== 0) {
      return firstComparison;
    }
    return a[names].localeCompare(b[names]);
  });
  return players;
}
function filterEmptyValues(array){
  return array.filter(function(vl) {
    return vl[0] !== "";
  });
}

// ---------- Finding round threads ----------

function extractURLs(text, contains, begin, end, firstThreadNumber) {
  var result = [];
  var index = text.indexOf(contains);
  while (index !== -1) {
    //"begin" dozadu
    var beginIndex = text.lastIndexOf(begin, index);
    if (beginIndex === -1) {
      throw new Error(`Nenalezen znak "${begin}" před výskytem "${contains}".`);
    } else {
      beginIndex += 1;
    }
    //"end" dopředu
    var endIndex = text.indexOf(end, index + contains.length);
    if (endIndex === -1) {
      throw new Error(`Nenalezen znak "${end}" za výskytem "${contains}".`);
    }
    // Získáme podřetězec od znaku "begin" do znaku "end"
    var substring = "https://www.smogon.com"+text.slice(beginIndex, endIndex).replace("preview","").replace("latest","");
    // Přidáme podřetězec do výsledného pole
    var threadNumber = parseInt(findCut(substring,".","/",30));
    if (substring.includes("signups") == false && substring.includes("page-") == false && substring.includes("cycle") == false && threadNumber >= firstThreadNumber){
      result.push(substring);
    }
    // Hledáme další výskyt "contains"
    index = text.indexOf(contains, index + 1);
  }
  // Použijeme Set pro odstranění duplikátů
  return [...new Set(result)];
}
// https://www.smogon.com/forums/threads/adv-nu-cup-round-1.3776192/ -> 3776192
function threadNumberOf(url) {
  var match = url.match(/\.(\d+)\/?$/);
  return match ? parseInt(match[1]) : 0;
}
function getRoundURLs(sheet, columnNumber, pagesSheetName) {
  var firstThreadNumber = sheet.getRange(4,2).getValue();
  var listingUrls = listingUrlsFor(sheet.getRange(2,columnNumber-1).getValue(), sheet.getRange(5,columnNumber-1).getValue());
  var forumPage = listingUrls.map(function (url) { return readPage(url, pagesSheetName); }).join("");
  var range = sheet.getRange(5, columnNumber, sheet.getLastRow()-1,1) //range and values where the urls are
  var values = range.getValues();
  var newValues = extractURLs(forumPage,sheet.getRange(2,columnNumber).getValue(),'"','"',firstThreadNumber) //taking urls from forum page
  // The forum lists threads by latest reply, so a late reply can bump an old round above newer ones.
  // Thread numbers grow as threads are created - newest round first, as the rest of the script expects.
  newValues.sort(function (a, b) {
    return threadNumberOf(b) - threadNumberOf(a);
  });
  for (var i = 0; i < values.length; i++) { //replacing values in sheet with new ones
    values[i][0] = newValues[i];
  }
  //updates the urls in sheet + returns urls for a tournament
  range.setValues(values)
  return newValues
}

// ---------- Writing the sheets ----------

function fillCircuit(backstageSheetName, pagesSheetName){ //check out 999 ost, its SOO good
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(backstageSheetName);
  var mainSheet = spreadsheet.getSheetByName(sheet.getRange(2,1).getValue());
  var tourSheet = spreadsheet.getSheetByName(sheet.getRange(2,2).getValue());
  deleteContentFrom(tourSheet, 3, 1);
  var columns = getStartingColumns(sheet,1,3,4);//starting columns for each tournament in sheet
  var tourColumns = Array.from({ length: columns.length }, (_, i) => 1 + i * 5); //starting columns in the tournaments page
  var finalPlayerSheet = [];
  for (var c = 0; c < columns.length; c++){ //for each tournament/block in sheet
    var startingColumn = columns[c];
    var tourColumn = tourColumns[c];
    var doubleElim = String(sheet.getRange(2, startingColumn + 2).getValue()).trim().toLowerCase() === "yes";
    var urls = getRoundURLs(sheet, startingColumn + 1, pagesSheetName);
    var players = sortPlayers(getTournamentPlayerPoints(urls, pagesSheetName, doubleElim),1,0);
    console.log(sheet.getRange(2, startingColumn + 1).getValue() + ": " + urls.length + " rounds, " + players.length + " players" + (doubleElim ? " (double elim)" : ""));
    var playerValues = [] //Names
    for (var i = 0; i < players.length; i++) {
      playerValues.push([players[i][0]]);
    }
    var roundValues = [] //Round reached
    for (var i = 0; i < players.length; i++) {
      roundValues.push([players[i][1]]);
    }
    // SET POINT REWARDS for each round that have to be already in the sheet - filters and reverses for further use
    var roundPoints = filterEmptyValues(sheet.getRange(5,startingColumn+2,sheet.getLastRow()-4,1).getValues()).reverse();
    var pointValues = [];
    var pts = "X";
    for (var i = 0; i < players.length; i++) {
      if (roundValues[i][0] === 0) {
        pts = 0; // lost twice in a double-elimination tournament
      } else {
        pts = roundPoints[roundValues[i][0]-1][0];
      }
      pointValues.push([pts]);
      players[i].push(pts)
    }
    var rankValues = [[1]]; //ranks for individual torunament
    for (var j = 1; j < pointValues.length; j++){
      if (pointValues[j-1][0] == pointValues[j][0]){
        rankValues.push(rankValues[j-1]);
      }else{
        rankValues.push([j+1]);
      }
    }
    urls = urls.map(function(x) {
      return [x];
    });
    //write stuff to tournaments page
    var rankRange = tourSheet.getRange(3,tourColumn+1,players.length,1);
    var playerRange = tourSheet.getRange(3,tourColumn+2,players.length,1);
    var pointRange = tourSheet.getRange(3,tourColumn+3,players.length,1);
    var urlRange = tourSheet.getRange(3,tourColumn,urls.length,1);
    rankRange.setValues(rankValues);
    playerRange.setValues(playerValues);
    pointRange.setValues(pointValues);
    urlRange.setValues(urls);
    finalPlayerSheet = sortPlayers(addTournamentToTotal(players, finalPlayerSheet),2,0);
  }
  // Rename table: Backstage A6:A (name on Smogon) -> B6:B (name to show)
  var origNames = sheet.getRange(6,1,sheet.getLastRow()-5,1).getValues();
  var newNames = sheet.getRange(6,2,sheet.getLastRow()-5,1).getValues();
  for (var n = 0; n < origNames.length;n++){
    if (origNames[n][0] === "") continue;
    for (var p = 0; p < finalPlayerSheet.length; p++){
      if (finalPlayerSheet[p][0] == origNames[n][0]){
        finalPlayerSheet[p][0] = newNames[n][0];
      }
    }
  }
  //make the sheet that will get posted
  var finalSheet = makeFinalSheet(finalPlayerSheet);
  //write stuff to main sheet
  deleteContentFrom(mainSheet, 2, 1);
  mainSheet.getRange(2, 1, finalSheet.length, finalSheet[0].length).setValues(finalSheet);
  //Done! Yay!
}
function makeFinalSheet(finalPlayerSheet){
  var finalSheet = []
  for (var i = 0; i < finalPlayerSheet.length; i++){
    finalSheet.push([])
    //ranks
    if (i == 0){
      finalSheet[i].push(1)
    }else{
      if (finalPlayerSheet[i][2] == finalPlayerSheet[i-1][2]){
        finalSheet[i].push(finalSheet[i-1][0]);
      }else{
      finalSheet[i].push(i+1);
      }
    }
    //names
    finalSheet[i].push(finalPlayerSheet[i][0]);
    //total pts
    finalSheet[i].push(finalPlayerSheet[i][2]);
    //empty space
    finalSheet[i].push(" ");
    //indiv tours
    for (var j = 3; j < finalPlayerSheet[i].length;j++){
      finalSheet[i].push(finalPlayerSheet[i][j]);
    }
  }
  return finalSheet;
}
function deleteContentFrom(sheet, startRow, startColumn) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (startRow <= lastRow && startColumn <= lastColumn) {
    var rowsToDelete = lastRow - startRow + 1;
    var columnsToDelete = lastColumn - startColumn + 1;
    if (rowsToDelete > 0 && columnsToDelete > 0) {
      sheet.getRange(startRow, startColumn, rowsToDelete, columnsToDelete).clearContent();
    }
  }
}
function addTournamentToTotal(players, finalPlayerSheet) {
  // players = [[name, round, id, pts]]
  // finalPlayerSheet = [[name, id, totalPts, pts1, pts2, ...]]
  var tournamentNumber = finalPlayerSheet.length === 0 ? 0 : finalPlayerSheet[0].length - 3; // tournaments already stored
  var foundPlayers = new Set();
  for (var i = 0; i < finalPlayerSheet.length; i++) {
    var found = false;
    for (var j = 0; j < players.length; j++) {
      if (finalPlayerSheet[i][1] == players[j][2]) {
        finalPlayerSheet[i][0] = players[j][0]; // same ID, maybe a new name
        finalPlayerSheet[i][2] += players[j][3];
        finalPlayerSheet[i].push(players[j][3]);
        foundPlayers.add(players[j][2]);
        found = true;
        break;
      }
    }
    if (!found) { // in the standings, but not in this tournament
      finalPlayerSheet[i].push("");
    }
  }
  // Players new to the standings: blanks for the tournaments they missed, then this one
  for (var i = 0; i < players.length; i++) {
    if (!foundPlayers.has(players[i][2])) {
      var newPlayer = [players[i][0], players[i][2], players[i][3]];
      for (var e = 0; e < tournamentNumber; e++) {
        newPlayer.push("");
      }
      newPlayer.push(players[i][3]);
      finalPlayerSheet.push(newPlayer);
    }
  }
  return finalPlayerSheet;
}
function getStartingColumns(sheet, startRow, startColumn, blockWidth) {
  var columns = []
  for (var i = startColumn; ; i += blockWidth) {
    var value = sheet.getRange(startRow, i).getValue();
    if (value !== "") {
      columns.push(i);
    } else {
      // empty cell - end
      break;
    }
  }
  return columns;
}
