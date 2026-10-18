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
function isSubstringBetween(text, contains, begin, end) {
  var indexOfContains = text.indexOf(contains);
  while (indexOfContains !== -1) {
    var indexOfBegin = findLastIndex(text, begin, indexOfContains); //Finds last index of "begin" before "contains"
    var indexOfEnd = text.indexOf(end, indexOfBegin); //If there's string "end" between the two, this "contains" is not betwee begin and end - so this searches from begin
    if (indexOfBegin !== -1 && indexOfBegin < indexOfContains && indexOfContains < indexOfEnd) {
      // Bteween "begin" and "contains" is "end" - finds antoher "contains" and starts from beginning
      var indexOfNextBegin = text.indexOf(begin, indexOfContains + 1);
      if (indexOfNextBegin == -1 || indexOfNextBegin > indexOfEnd) {
        return true;
      }
    }
    indexOfContains = text.indexOf(contains, indexOfContains + 1)
  }
  return false;
}
function isFirstSubstringBetween(text, contains, begin, end) {
  var indexOfContains = text.indexOf(contains);
    var indexOfBegin = findLastIndex(text, begin, indexOfContains); //Finds last index of "begin" before "contains"
    var indexOfEnd = text.indexOf(end, indexOfBegin); //If there's string "end" between the two, this "contains" is not betwee begin and end - so this searches from begin
    if (indexOfBegin !== -1 && indexOfBegin < indexOfContains && indexOfContains < indexOfEnd) {
      // Bteween "begin" and "contains" is "end" - finds antoher "contains" and starts from beginning
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
  var bullshit = [];
  for (var i=1; i<=34;i++){ //seeding bullshit
    bullshit.push('('+i+')');
  }
  for (var b = 1; b <= bullshit.length; b++){
    var rep = "("+b+")";
    message = message.replace(rep, '');
  }
  return message;
}
function getOGPlayersFromMessage(message, players, prmes) {//The main function for the actual getting info from the post stuff
  // Find the player tag
  var losersCutoff = message.toLowerCase().indexOf("losers");
  var tagStart = message.indexOf('<a href="https://www.smogon.com/forums/members/');
  if (tagStart === -1) {
    return players;
  } else {
    var playerID = findCut(message, 'data-user-id="', '" ', tagStart);
    var playerText = findCut(message, '">', "</a>", tagStart).replace("<b>", "").replace("</b>", "").replace("<u>", "").replace("</u>", "").replace("<s>", "").replace("</s>", "");
    var player = [playerText, 0, playerID, false]; // [name, score, id, isWinner]
    // If someone is between ( ) and not underlined, they are not rly in this round yet
    if (isFirstSubstringBetween(prmes,playerText,"(",")") && isFirstSubstringBetween(message,playerText,"<u>","</u>") != true) {
     return getOGPlayersFromMessage(message.slice(tagStart+1),players, prmes); 
    }
    // BOLD = winner
    var endOfTag = message.indexOf(">", tagStart);
    var anchorTag = message.substring(tagStart, endOfTag);
    if (anchorTag.includes('data-username="[B]')) {
      player[3] = true;
      player[1]++;
      if (losersCutoff != -1 && losersCutoff > tagStart) {
        player[1]++;
      }
    }
    if (losersCutoff != -1 && losersCutoff > tagStart) { //Winners bracket ~~ round ahead
      player[1] = player[1] + 1
    }
    players.push(player);
    return getOGPlayersFromMessage(message.slice(tagStart+1), players, message);
  }
}
function getOGPlayersForRound(url) {
  var htmlText = UrlFetchApp.fetch(url).getContentText();
  var message = firstMessage(htmlText);
  var roundCutoff = message.indexOf("Rules");
  if (message.indexOf("tournament-rules-and-general-guidelines") > 1) {
    roundCutoff = message.indexOf("tournament-rules-and-general-guidelines");
  }
  message = message.slice(roundCutoff);//This should get rid of most of the artists
  message = removeBullshit(message); //im tired
  return getOGPlayersFromMessage(message,[], message);
}
function test(mes){
  var a = "hbrh (1) wda";
  var b = "(1)"
  a.replace
}
function sortPlayers(players, numbers, names) {
  players.sort(function (a, b) {
    // by numbers
    var firstComparison = b[numbers] - a[numbers];
    // alphabetically
    var secondComparison = a[names].localeCompare(b[names]);
    if (firstComparison !== 0) {
      return firstComparison;
    }
    return secondComparison;
  });
  return players;
}
function filterEmptyValues(array){
  var values = array.filter(function(vl) {
    return vl[0] !== "";
  });
  return values
}
function getOGTournamentPlayerPoints(urls, tourNumber) {
  const playersMap = new Map();
  urls = urls.slice().reverse();
  for (let round = 0; round < urls.length; round++) {
    const rndPlayers = getOGPlayersForRound(urls[round]);
    const seenThisRound = new Map();
    // Deduplicate players within the round
    for (const player of rndPlayers) {
      const [name, score, id, isWinner] = player;
      if (!seenThisRound.has(id)) {
        seenThisRound.set(id, [name, score, id, isWinner]);
      } else {
        const existing = seenThisRound.get(id);
        existing[1] = Math.min(existing[1], score);
        // Preserve winner flag if either copy was the winner
        existing[3] = existing[3] || isWinner;
        if (existing[1] === 3 && (rndPlayers.length === 12 || rndPlayers.length === 6)) {
          existing[1] = 2;
        }
      }
    }
    const isFinal =
      round === urls.length - 1 &&
      seenThisRound.size === 2;
    seenThisRound.forEach(([name, score, id, isWinner]) => {
      let roundReached = round + 1;
      // Only the actual winner of a completed final gets the extra round
      if (isFinal && isWinner) {
        roundReached++;
      }
      if (!playersMap.has(id) || roundReached > playersMap.get(id)[1]) {
        playersMap.set(id, [name, roundReached, id]);
      }
    });
  }
  return Array.from(playersMap.values());
}
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
  var uniqueResult = [...new Set(result)];
  return uniqueResult;
}
function getOGRoundURLs(columnNumber) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("OG Backstage"); //getting the sheet
  var firstThreadNumber = sheet.getRange(4,2).getValue();
  var forumURL = sheet.getRange(2,columnNumber-1).getValue() + sheet.getRange(5,columnNumber-1).getValue() //forum
  var forumurl2 = sheet.getRange(2,columnNumber-1).getValue() + "page-2" + sheet.getRange(5,columnNumber-1).getValue()
  var forumurl3 = sheet.getRange(2,columnNumber-1).getValue() + "page-3" + sheet.getRange(5,columnNumber-1).getValue()
  var forumurl4 = sheet.getRange(2,columnNumber-1).getValue() + "page-4" + sheet.getRange(5,columnNumber-1).getValue() //four pages should be enough for a year
  var range = sheet.getRange(5, columnNumber, sheet.getLastRow()-1,1) //range and values where the urls are
  var values = range.getValues();
  var forumPage = UrlFetchApp.fetch(forumURL).getContentText() + UrlFetchApp.fetch(forumurl2).getContentText()+ UrlFetchApp.fetch(forumurl3).getContentText()+ UrlFetchApp.fetch(forumurl4).getContentText()
  var newValues = extractURLs(forumPage,sheet.getRange(2,columnNumber).getValue(),'"','"',firstThreadNumber) //taking urls from forum page
  for (var i = 0; i < values.length; i++) { //replacing values in sheet with new ones
    values[i][0] = newValues[i];
  }
  //updates the urls in sheet + returns urls for a tournament
  range.setValues(values)
  return newValues
}
function fillOGSheet(){ //check out 999 ost, its SOO good
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("OG Backstage");
  var mainSheet = spreadsheet.getSheetByName(sheet.getRange(2,1).getValue());
  var tourSheet = spreadsheet.getSheetByName(sheet.getRange(2,2).getValue());
  deleteContentFrom(tourSheet, 3, 1);
  var columns = getStartingColumns(sheet,1,3,4);//starting columns for each tournament in sheet
  var tourColumns = Array.from({ length: columns.length }, (_, i) => 1 + i * 5); //starting columns in the tournaments page
  var finalPlayerSheet = [];
  for (var c = 0; c < columns.length; c++){ //for each tournament/block in sheet
    var startingColumn = columns[c];
    var tourColumn = tourColumns[c];
    var urls = getOGRoundURLs(startingColumn + 1);
    var players = sortPlayers(getOGTournamentPlayerPoints(urls, c),1,0);
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
    var rnd = 0;
    for (var i = 0; i < players.length; i++) {
      rnd = roundValues[i][0]-1;
      pts = roundPoints[rnd][0];
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
      //update the actual sheet data, don't use the "players" var from this point on
    finalPlayerSheet = sortPlayers(addTournamentToTotal(players, finalPlayerSheet),2,0);
  }
  var origNames = sheet.getRange(6,1,sheet.getLastRow()-5,1).getValues();
  var newNames = sheet.getRange(6,2,sheet.getLastRow()-5,1).getValues();
  for (var n = 0; n < origNames.length;n++){
    for (var p = 0; p < finalPlayerSheet.length; p++){
      if (finalPlayerSheet[p][0] == origNames[n]){
        finalPlayerSheet[p][0] = newNames[n];
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
  //transposed for setValues
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
      //players= [[name, round, id, pts]]
      //finalPlayeSheet = [[name, id, totalPts, pts1,pts2,..]]
  for (var i = 0; i < finalPlayerSheet.length; i++) { 
    var notFound = true;
    for (var j = players.length - 1; j >= 0; j--) {
      if (finalPlayerSheet[i][1] == players[j][2]) {//player found-add stuff
        if (finalPlayerSheet[i][0] != players[j][0]){//ID same, name different = name change
          finalPlayerSheet[i][0] = players[j][0];
        }
        finalPlayerSheet[i][2] += players[j][3]; //add score to total
        finalPlayerSheet[i].push(players[j][3]); //new indiv tour score push
        players.splice(j, 1); //player added - remove from array (wont be needed)
        notFound = false;
      }
    }
    if (notFound) {//player in total score, but not participated in torunament-add empty space for tour pts
      finalPlayerSheet[i].push("")
    }
  }
  //Adding new players:
  var tournamentNumber;
  if(finalPlayerSheet.length == 0){
    tournamentNumber = 1;
  } else {
    tournamentNumber = finalPlayerSheet[0].length-3;
  }
  for (var i = 0; i < players.length; i++){
    var newPlayer = [players[i][0],players[i][2],players[i][3]]
    for (var e = 1; e < tournamentNumber; e++){ //empty tournaments that player wasnt in
      newPlayer.push("");
    }
    newPlayer.push(players[i][3]);
    finalPlayerSheet.push(newPlayer);
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