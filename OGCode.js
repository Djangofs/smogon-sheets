// OG circuit. All the logic lives in Shared.js, which must be in the same Apps Script project.
function fetchOGPages() {
  fetchCircuitPages("OG Backstage", "OG Pages");
}
function fillOGSheet() {
  fillCircuit("OG Backstage", "OG Pages");
}
function updateOGSheet() {
  fetchOGPages();
  fillOGSheet();
}
