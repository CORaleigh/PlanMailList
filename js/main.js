// entry point: ui.js runs first (layout, About) while the ArcGIS modules load for the rest
import "./ui.js";
import { createSearch } from "./search.js";
import { searchProperty, addPropertyByAddress, applyBufferDistance } from "./properties.js";
import { initTools } from "./tools.js";
import { generateLabels, exportCsv } from "./exports.js";

initTools();
createSearch(document.getElementById("addressSearch"), searchProperty);
createSearch(document.getElementById("addSearch"), addPropertyByAddress);
document.getElementById("bufferDistance").addEventListener("calciteInputChange", applyBufferDistance);
document.getElementById("labelsButton").addEventListener("click", generateLabels);
document.getElementById("csvButton").addEventListener("click", exportCsv);

// these links use href="#" so Enter activates them. Cancel the "#" navigation from window, after
// Calcite has handled the click (it ignores prevented clicks), so this must be registered after Calcite's
// own listener, i.e. once the components have loaded, not early in ui.js.
window.addEventListener("click", (event) => {
	if (event.composedPath().some(el => el.id === "searchHelp" || el.id === "measureHelp")) {
		event.preventDefault();
	}
});
