// CG circuit. All the logic lives in Shared.js, which must be in the same Apps Script project.
function fetchPages() {
  fetchCircuitPages("CG Backstage", "CG Pages");
}
function fillSheet() {
  fillCircuit("CG Backstage", "CG Pages");
}
function updateSheet() {
  fetchPages();
  fillSheet();
}
