import { config } from "./config.js";
import { state } from "./state.js";
import { Graphic, SimpleFillSymbol, Query, query } from "./arcgis.js";
import { mapElement, selectionLayer, bufferLayer, pinLayer, bufferFeet } from "./map.js";
import { searchPinSymbol } from "./pin.js";

// notification buffer distance in feet (100 unless the user changes it)
export const bufferDistance = () => {
	const feet = parseFloat(document.getElementById("bufferDistance").value);
	return feet > 0 ? feet : 100;
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const getMailingAddresses = async (pins) => {
	try {
		// only the fields the labels and the property list use
		const data = await query.executeQueryJSON(config.mailListService, new Query({
			where: `PIN_NUM IN (${pins.map(pin => `'${pin}'`).join(",")})`,
			outFields: ["PIN_NUM", "OWNER", "ADDR1", "ADDR2", "ADDR3", "SITE_ADDRESS"]
		}));
		state.labels = [];
		for (const {attributes: account} of data.features) {
			const owner = account.OWNER.length > 50 ? `${account.OWNER.substring(0, 50)}...` : account.OWNER;
			const label = {owner, addr1: account.ADDR1, addr2: account.ADDR2, addr3: account.ADDR3, pin: account.PIN_NUM};
			if (account.SITE_ADDRESS && !state.siteAddresses[account.PIN_NUM]) {
				state.siteAddresses[account.PIN_NUM] = account.SITE_ADDRESS.trim();
			}
			if (account.PIN_NUM === pins[0]) {
				state.labels.unshift(label);
			} else {
				state.labels.push(label);
			}
		}
		document.querySelectorAll(".postsearch").forEach(el => el.hidden = false);
		renderSelectedList();
		updateResultStatus();
	} catch (error) {
		console.error(error);
	}
};

// pin === null clears the highlight
const highlightProperty = (pin) => {
	selectionLayer.graphics.forEach(graphic => {
		const symbol = graphic.symbol.clone();
		symbol.color = graphic.attributes.PIN_NUM === pin ? [255, 0, 0, 0.60] : [255, 0, 0, 0.10];
		graphic.symbol = symbol;
	});
};

// keyboard and screen reader friendly list of the selected properties, each with a Remove action
const renderSelectedList = () => {
	const list = document.getElementById("selectedList");
	list.replaceChildren();
	state.pins.forEach((pin, i) => {
		const count = state.labels.filter(label => label.pin === pin).length;
		const name = state.siteAddresses[pin] || `PIN ${pin}`;
		const item = document.createElement("calcite-list-item");
		item.label = name;
		item.description = `${i === 0 ? "Searched property · " : ""}PIN ${pin} · ${count === 0 ? "no mailing address on record" : plural(count, "mailing address", "mailing addresses")}`;
		if (i > 0) {
			const action = document.createElement("calcite-action");
			action.slot = "actions-end";
			action.icon = "trash";
			action.text = `Remove ${name}`;
			action.addEventListener("click", () => {
				removePin(pin);
				list.setFocus();
			});
			item.appendChild(action);
		}
		["mouseenter", "focusin"].forEach(type => item.addEventListener(type, () => highlightProperty(pin)));
		["mouseleave", "focusout"].forEach(type => item.addEventListener(type, () => highlightProperty(null)));
		list.appendChild(item);
	});
	document.getElementById("selectedBlock").heading = `Selected properties (${state.pins.length})`;
};

// visible count that is also announced by screen readers (role="status")
const updateResultStatus = () => {
	document.getElementById("resultStatus").textContent =
		`${plural(state.labels.length, "mailing address", "mailing addresses")} from ${plural(state.pins.length, "property", "properties")} selected.`;
};

const queryProperties = (geometry) => query.executeQueryJSON(`${config.propertyService}/0`, new Query({
	geometry,
	outFields: ["PIN_NUM"],
	returnGeometry: true,
	outSpatialReference: mapElement.spatialReference
}));

export const getAdjacentProperties = async (geometry, add) => {
	if (!add) {
		selectionLayer.removeAll();
	}
	const featureSet = await queryProperties(geometry);
	for (const feature of featureSet.features) {
		const pin = feature.attributes.PIN_NUM;
		if (!state.pins.includes(pin)) {
			state.pins.push(pin);
		}
		// re-adding a selected property shouldn't stack a second (darker) graphic on it
		if (!selectionLayer.graphics.some(graphic => graphic.attributes.PIN_NUM === pin)) {
			feature.symbol = SimpleFillSymbol.fromJSON(config.propertyFill);
			selectionLayer.add(feature);
		}
	}
	await getMailingAddresses(state.pins);
};

const drawBuffer = (property) => {
	const geometry = bufferFeet(property, bufferDistance());
	bufferLayer.removeAll();
	bufferLayer.add(new Graphic({geometry, symbol: SimpleFillSymbol.fromJSON(config.innerFill)}));
	mapElement.goTo(bufferLayer.graphics.toArray());
	getAdjacentProperties(geometry, false);
};

// the property at the searched address, its buffer, and everything the buffer reaches
export const searchProperty = async (point) => {
	pinLayer.removeAll();
	pinLayer.add(new Graphic({geometry: point, symbol: searchPinSymbol()}));
	state.pins = [];
	state.siteAddresses = {};
	const featureSet = await queryProperties(point);
	const [property] = featureSet.features;
	if (property) {
		state.pins.push(property.attributes.PIN_NUM);
		state.subjectGeometry = property.geometry;
		drawBuffer(state.subjectGeometry);
	}
};

export const addPropertyByAddress = (point) => {
	const search = document.getElementById("addSearch");
	getAdjacentProperties(point, true);
	search.value = "";
	search.inputValue = "";
	search.replaceChildren();
};

export const removePropertyAt = async (event) => {
	const response = await mapElement.hitTest(event, {include: [selectionLayer]});
	if (response.results.length > 0) {
		removePin(response.results[0].graphic.attributes.PIN_NUM);
	}
};

// the searched property (pins[0]) can't be removed
const removePin = (pin) => {
	if (pin === state.pins[0] || !state.pins.includes(pin)) {
		return;
	}
	selectionLayer.graphics.toArray()
		.filter(graphic => graphic.attributes.PIN_NUM === pin)
		.forEach(graphic => selectionLayer.remove(graphic));
	state.pins = state.pins.filter(p => p !== pin);
	state.labels = state.labels.filter(label => label.pin !== pin);
	renderSelectedList();
	updateResultStatus();
};

// typed (keyboard) or measured right-of-way width, in feet
export const applyRightOfWay = (width) => {
	const input = document.getElementById("rowWidth");
	if (!(width > 0)) {
		input.status = "invalid";
		input.validationMessage = "Enter the right-of-way width in feet.";
		return;
	}
	// a right-of-way as wide as the buffer distance or wider isn't counted
	if (width >= bufferDistance()) {
		input.status = "invalid";
		input.validationMessage = `Right-of-way is ${bufferDistance()} feet or wider (the buffer distance), so no extra buffer is added.`;
		return;
	}
	input.status = "idle";
	input.validationMessage = "";
	const geometry = bufferFeet(bufferLayer.graphics.getItemAt(0).geometry, width);
	if (bufferLayer.graphics.length > 1) {
		bufferLayer.remove(bufferLayer.graphics.getItemAt(1));
	}
	bufferLayer.add(new Graphic({geometry, symbol: SimpleFillSymbol.fromJSON(config.outerFill)}));
	mapElement.goTo(bufferLayer.graphics.toArray());
	getAdjacentProperties(geometry, false);
};

// changing the distance redraws the buffer around the searched property and reselects properties
export const applyBufferDistance = () => {
	const input = document.getElementById("bufferDistance");
	const feet = parseFloat(input.value);
	if (!(feet > 0) || feet > 5280) {
		input.status = "invalid";
		input.validationMessage = "Enter a distance from 1 to 5,280 feet.";
		return;
	}
	input.status = "idle";
	input.validationMessage = "";
	if (state.subjectGeometry) {
		state.pins = [state.pins[0]];
		document.getElementById("rowWidth").value = "";
		drawBuffer(state.subjectGeometry);
	}
};
