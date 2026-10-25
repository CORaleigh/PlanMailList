// page behavior that doesn't need the map; runs before the ArcGIS modules load

// on narrow screens the tool panel moves below the map
const narrowScreen = window.matchMedia("(max-width: 767px)");
const updateLayout = () => {
	const narrow = narrowScreen.matches;
	const panel = document.querySelector("calcite-shell-panel");
	panel.slot = narrow ? "panel-bottom" : "panel-start";
	panel.layout = narrow ? "horizontal" : "vertical";
	panel.resizable = narrow;
	// large inputs use 16px text, which stops iOS Safari zooming in on focus, and give bigger touch targets
	for (const id of ["addressSearch", "addSearch", "bufferDistance", "rowWidth", "rowApply"]) {
		document.getElementById(id).scale = narrow ? "l" : "m";
	}
	// icon-only About on phones so the title fits; label="About this app" keeps its accessible name
	document.getElementById("aboutButton").textContent = narrow ? "" : "About";
};
narrowScreen.addEventListener("change", updateLayout);
updateLayout();

// help videos never autoplay; stop one when its popover closes
for (const popover of document.querySelectorAll("calcite-popover")) {
	popover.addEventListener("calcitePopoverClose", () => {
		popover.querySelectorAll("video").forEach(video => video.pause());
	});
}

// About opens on load unless the viewer chose "Don't show this again" (saved in this browser only)
const aboutDialog = document.getElementById("disclaimer");
const hideAbout = document.getElementById("hideAbout");
const hideAboutKey = "planMailList.hideAbout";
const readHideAbout = () => {
	try {
		return localStorage.getItem(hideAboutKey) === "1";
	} catch {
		return false;
	}
};
const saveHideAbout = (hide) => {
	try {
		if (hide) {
			localStorage.setItem(hideAboutKey, "1");
		} else {
			localStorage.removeItem(hideAboutKey);
		}
	} catch {
		// storage blocked (e.g. private browsing): the dialog will just show again next time
	}
};
hideAbout.checked = readHideAbout();
hideAbout.addEventListener("calciteCheckboxChange", () => saveHideAbout(hideAbout.checked));
document.getElementById("aboutButton").addEventListener("click", () => aboutDialog.open = true);
document.getElementById("disclaimerClose").addEventListener("click", () => aboutDialog.open = false);
if (!hideAbout.checked) {
	aboutDialog.open = true;
}
