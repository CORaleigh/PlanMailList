import { state } from "./state.js";
import { Graphic, Point, Multipoint, SketchViewModel } from "./arcgis.js";
import { mapElement, parcelLayer, sketchLayer, distanceFeet } from "./map.js";
import { getAdjacentProperties, removePropertyAt, applyRightOfWay } from "./properties.js";

const toolButtons = {measure: "measure", add: "addButton", remove: "removeButton"};
const instructions = {
	measure: "On the map, click or tap one edge of the right-of-way, then the opposite edge. The line snaps to property lines; hold Ctrl to place a point freely, or press Esc to cancel. You can also type the width below.",
	add: "Click or tap each property on the map to add it, then double-click or double-tap the last one to finish. You can also use Add a property by address below.",
	remove: "Click or tap a red property on the map to remove it, or use the Remove buttons under Selected properties below."
};
let measureSketch;

const setMode = (newMode) => {
	state.mode = newMode;
	state.addPoints = [];
	if (measureSketch?.state === "active") {
		measureSketch.cancel();
	}
	sketchLayer.removeAll();
	for (const [key, id] of Object.entries(toolButtons)) {
		document.getElementById(id).appearance = key === state.mode ? "solid" : "outline";
	}
	const notice = document.getElementById("instructions");
	notice.open = Boolean(instructions[state.mode]);
	notice.querySelector("[slot=message]").textContent = instructions[state.mode] ?? "";
	if (state.mode === "measure") {
		startMeasure();
	}
};

// two-point measure line that snaps to the parcel lines
const startMeasure = () => {
	if (!measureSketch) {
		measureSketch = new SketchViewModel({
			view: mapElement.view,
			layer: sketchLayer,
			polylineSymbol: {type: "simple-line", style: "solid", color: [53, 172, 70], width: 3},
			snappingOptions: {
				enabled: true,
				featureSources: [{layer: parcelLayer, enabled: true}]
			}
		});
		measureSketch.on("create", (event) => {
			const path = event.graphic?.geometry?.paths[0];
			// finish as soon as the second point is placed
			if (event.state === "active" && event.toolEventInfo?.type === "vertex-add" && path.length >= 2) {
				measureSketch.complete();
			} else if (event.state === "complete") {
				measureComplete(path, event.graphic.geometry.spatialReference);
			} else if (event.state === "cancel" && state.mode === "measure") {
				// Esc
				setMode(null);
			}
		});
	}
	measureSketch.create("polyline");
};

const measureComplete = (path, spatialReference) => {
	const [[x1, y1], [x2, y2]] = [path[0], path.at(-1)];
	const length = distanceFeet(new Point({x: x1, y: y1, spatialReference}), new Point({x: x2, y: y2, spatialReference}));
	setMode(null);
	document.getElementById("rowWidth").value = String(Math.round(length));
	applyRightOfWay(length);
};

const addPoint = ({mapPoint}) => {
	state.addPoints.push([mapPoint.x, mapPoint.y]);
	sketchLayer.add(new Graphic({
		geometry: mapPoint,
		symbol: {type: "simple-marker", color: [53, 172, 70], size: 8, outline: {color: [255, 255, 255], width: 1}}
	}));
};

const finishAdd = () => {
	if (state.addPoints.length > 0) {
		getAdjacentProperties(new Multipoint({points: state.addPoints, spatialReference: mapElement.spatialReference}), true);
	}
	state.addPoints = [];
	sketchLayer.removeAll();
};

export const initTools = () => {
	// map component events carry the view event in event.detail
	mapElement.addEventListener("arcgisViewClick", ({detail}) => {
		if (state.mode === "add") {
			addPoint(detail);
		} else if (state.mode === "remove") {
			removePropertyAt(detail);
		}
	});

	mapElement.addEventListener("arcgisViewDoubleClick", ({detail}) => {
		if (state.mode === "add") {
			// finish the selection instead of zooming in; the map doesn't fire
			// a click for a double-click, so the double-clicked property is added here
			detail.stopPropagation();
			addPoint(detail);
			finishAdd();
		}
	});

	// clicking the active tool again turns it off
	for (const [key, id] of Object.entries(toolButtons)) {
		document.getElementById(id).addEventListener("click", () => setMode(state.mode === key ? null : key));
	}

	const rowWidth = document.getElementById("rowWidth");
	document.getElementById("rowApply").addEventListener("click", () => applyRightOfWay(parseFloat(rowWidth.value)));
	rowWidth.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			applyRightOfWay(parseFloat(rowWidth.value));
		}
	});
};
