var config = {
	map:{
		// Esri Community vector basemap (public item, Web Mercator)
		basemap: {portalItemId: "273bf8d5c8ac400183fc24e109d20bcf"},
		extent: {xmin: 2049000, ymin: 714000, xmax: 2159000, ymax:814000, spatialReference: {wkid: 2264}}
	},
	addressService:"https://maps.raleighnc.gov/arcgis/rest/services/Addresses/MapServer/0/query",
    propertyService:"https://maps.raleighnc.gov/arcgis/rest/services/Property/Property//MapServer",
    mailListService:"https://maps.raleighnc.gov/arcgis/rest/services/Property/Property/MapServer/1",
    geocodeService:"https://maps.raleighnc.gov/arcgis/rest/services/Locators/FindMyService/GeocodeServer",
    outerFill: {
        type: "esriSFS",
        style: "esriSFSNull",
        color: [255, 255, 0],
        outline: {
            type: "esriSLS",
            style: "esriSLSDash",
            color: [0, 255, 255],
            width: 3
        }
    },
    innerFill: {
        type: "esriSFS",
        style: "esriSFSNull",
        color: [255, 0, 0],
        outline: {
            type: "esriSLS",
            style: "esriSLSSolid",
            color: [0, 255, 255],
            width: 3
        }
    },
    propertyFill: {
        type: "esriSFS",
        style: "esriSFSSolid",
        color: [255, 0, 0, 26],
        outline: {
            type: "esriSLS",
            style: "esriSLSSolid",
            color: [255, 0, 0],
            width: 2
        }
    }
};

// on narrow screens the tool panel moves below the map
var narrowScreen = window.matchMedia("(max-width: 767px)");
function updateLayout () {
	var panel = document.querySelector("calcite-shell-panel");
	panel.slot = narrowScreen.matches ? "panel-bottom" : "panel-start";
	panel.layout = narrowScreen.matches ? "horizontal" : "vertical";
	panel.resizable = narrowScreen.matches;
}
narrowScreen.addEventListener("change", updateLayout);
updateLayout();

const [
	Map, VectorTileLayer, FeatureLayer, GraphicsLayer, Graphic, Point, Multipoint, Polyline, Extent, SpatialReference,
	SimpleFillSymbol, SimpleLineSymbol, CIMSymbol, Query, query, bufferOperator, projectOperator
] = await $arcgis.import([
	"@arcgis/core/Map.js",
	"@arcgis/core/layers/VectorTileLayer.js",
	"@arcgis/core/layers/FeatureLayer.js",
	"@arcgis/core/layers/GraphicsLayer.js",
	"@arcgis/core/Graphic.js",
	"@arcgis/core/geometry/Point.js",
	"@arcgis/core/geometry/Multipoint.js",
	"@arcgis/core/geometry/Polyline.js",
	"@arcgis/core/geometry/Extent.js",
	"@arcgis/core/geometry/SpatialReference.js",
	"@arcgis/core/symbols/SimpleFillSymbol.js",
	"@arcgis/core/symbols/SimpleLineSymbol.js",
	"@arcgis/core/symbols/CIMSymbol.js",
	"@arcgis/core/rest/support/Query.js",
	"@arcgis/core/rest/query.js",
	"@arcgis/core/geometry/operators/bufferOperator.js",
	"@arcgis/core/geometry/operators/projectOperator.js"
]);
await projectOperator.load();

// The basemap is Web Mercator, which stretches distances by ~23% at Raleigh's latitude,
// so buffers and measurements are done in NC State Plane (US feet) like the parcel data.
var statePlane = new SpatialReference({wkid: 2264});

function bufferFeet (geometry, feet) {
	var buffered = bufferOperator.execute(projectOperator.execute(geometry, statePlane), feet, {unit: "feet"});
	return projectOperator.execute(buffered, mapElement.spatialReference);
}

function distanceFeet (start, end) {
	var a = projectOperator.execute(start, statePlane),
		b = projectOperator.execute(end, statePlane);
	return Math.hypot(b.x - a.x, b.y - a.y);
}

var mapElement, graphicsLayer, bufferLayer, sketchLayer, pinGraphicsLayer, labels = [], pins = [],
	// current map click mode: null, "add", "remove" or "measure"
	mode = null,
	addPoints = [],
	measureStart = null,
	// site address of each selected property, by PIN
	siteAddresses = {},
	// searched property's geometry, kept so the buffer can be redrawn at a new distance
	subjectGeometry = null;

// notification buffer distance in feet (100 unless the user changes it)
function bufferDistance () {
	var feet = parseFloat(document.getElementById("bufferDistance").value);
	return feet > 0 ? feet : 100;
}

function getMailingAddresses (pins) {
	var where = "PIN_NUM IN (" + pins.map(function (pin) {
		return "'" + pin + "'";
	}).join(",") + ")";
	// only the fields the labels and the property list use
	query.executeQueryJSON(config.mailListService, new Query({where: where, outFields: ['PIN_NUM', 'OWNER', 'ADDR1', 'ADDR2', 'ADDR3', 'SITE_ADDRESS']}))
	.then(function(data) {
		var label = {};
		labels = [];

		data.features.forEach(function(feature) {
			var account = feature.attributes,
				owner = account.OWNER;
			if (owner.length > 50) {
				owner = owner.substring(0,50) + "...";
			}
			label = {owner:owner, addr1:account.ADDR1,addr2:account.ADDR2,addr3:account.ADDR3,addr: account.ADDR1+"\n"+account.ADDR2+"\n"+account.ADDR3, pin:account.PIN_NUM};
			if (account.SITE_ADDRESS && !siteAddresses[account.PIN_NUM]) {
				siteAddresses[account.PIN_NUM] = account.SITE_ADDRESS.trim();
			}
			if (account.PIN_NUM === pins[0]) {
				labels.unshift(label);
			} else {
				labels.push(label);
			}
		});
		document.querySelectorAll(".postsearch").forEach(function (el) {
			el.hidden = false;
		});
		renderSelectedList();
		updateResultStatus();
		console.log("success");
	})
	.catch(function(error) {
		console.log("error", error);
	});
}

// pin === null clears the highlight
function highlightProperty (pin) {
	graphicsLayer.graphics.forEach(function (graphic) {
		var symbol = graphic.symbol.clone();
		symbol.color = (graphic.attributes.PIN_NUM === pin) ? [255, 0, 0, 0.60] : [255, 0, 0, 0.10];
		graphic.symbol = symbol;
	});
}

// keyboard and screen reader friendly list of the selected properties, each with a Remove action
function renderSelectedList () {
	var list = document.getElementById("selectedList");
	list.replaceChildren();
	pins.forEach(function (pin, i) {
		var count = labels.filter(function (label) { return label.pin === pin; }).length,
			name = siteAddresses[pin] || "PIN " + pin,
			item = document.createElement("calcite-list-item");
		item.label = name;
		item.description = (i === 0 ? "Searched property · " : "") + "PIN " + pin + " · " +
			(count === 0 ? "no mailing address on record" : count + (count === 1 ? " mailing address" : " mailing addresses"));
		if (i > 0) {
			var action = document.createElement("calcite-action");
			action.slot = "actions-end";
			action.icon = "trash";
			action.text = "Remove " + name;
			action.addEventListener("click", function () {
				removePin(pin);
				document.getElementById("selectedList").setFocus();
			});
			item.appendChild(action);
		}
		["mouseenter", "focusin"].forEach(function (type) {
			item.addEventListener(type, function () { highlightProperty(pin); });
		});
		["mouseleave", "focusout"].forEach(function (type) {
			item.addEventListener(type, function () { highlightProperty(null); });
		});
		list.appendChild(item);
	});
	document.getElementById("selectedBlock").heading = "Selected properties (" + pins.length + ")";
}

function queryProperties (geometry) {
	var q = new Query({
		geometry: geometry,
		outFields: ['PIN_NUM'],
		returnGeometry: true,
		outSpatialReference: mapElement.spatialReference
	});
	return query.executeQueryJSON(config.propertyService + "/0", q);
}

function getAdjacentProperties (geometry, add) {
	if (!add) {
		graphicsLayer.removeAll();
	}
	queryProperties(geometry).then(function (featureSet) {
		featureSet.features.forEach(function (feature) {
			var pin = feature.attributes.PIN_NUM;
			if (pins.indexOf(pin) === -1) {
				pins.push(pin);
			}
			// re-adding a selected property shouldn't stack a second (darker) graphic on it
			if (graphicsLayer.graphics.some(function (graphic) { return graphic.attributes.PIN_NUM === pin; })) {
				return;
			}
			feature.symbol = SimpleFillSymbol.fromJSON(config.propertyFill);
			graphicsLayer.add(feature);
		});
		getMailingAddresses(pins);
	});
}

function buffer (property) {
	var geometry = bufferFeet(property, bufferDistance());
	bufferLayer.removeAll();
	bufferLayer.add(new Graphic({geometry: geometry, symbol: SimpleFillSymbol.fromJSON(config.innerFill)}));
	mapElement.goTo(bufferLayer.graphics.toArray());
	getAdjacentProperties(geometry, false);
}

function getProperty (point) {
	pins = [];
	siteAddresses = {};
	queryProperties(point).then(function (featureSet) {
		if (featureSet.features.length > 0) {
			pins.push(featureSet.features[0].attributes.PIN_NUM);
			subjectGeometry = featureSet.features[0].geometry;
			buffer(subjectGeometry);
		}
	});
}

// address autocomplete backed by the City geocoder; onPoint receives the matched location
function createSearch (search, onPoint) {
	var cache = {},
		magicKeys = {},
		searching;

	function showSuggestions (suggestions) {
		search.replaceChildren();
		suggestions.forEach(function (suggestion) {
			var item = document.createElement("calcite-autocomplete-item");
			item.heading = suggestion.text;
			item.value = suggestion.text;
			item.label = suggestion.text;
			magicKeys[suggestion.text] = suggestion.magicKey;
			search.appendChild(item);
		});
	}

	search.addEventListener("calciteAutocompleteTextInput", function () {
		var text = search.inputValue;
		clearTimeout(searching);
		if (text.length < 4) {
			search.replaceChildren();
			return;
		}
		if (cache[text]) {
			showSuggestions(cache[text]);
			return;
		}
		searching = setTimeout(function () {
			var params = new URLSearchParams({f: "json", text: text});
			fetch(config.geocodeService + "/suggest?" + params)
			.then(function (response) { return response.json(); })
			.then(function (data) {
				cache[text] = data.suggestions || [];
				// ignore responses for text the user has already changed
				if (search.inputValue === text) {
					showSuggestions(cache[text]);
				}
			})
			.catch(function (error) { console.log("error", error); });
		}, 500);
	});

	search.addEventListener("calciteAutocompleteChange", function () {
		var address = search.value;
		if (!address) {
			return;
		}
		search.inputValue = address;
		var params = new URLSearchParams({f: "json", outSR: mapElement.spatialReference.wkid, SingleLine: address});
		if (magicKeys[address]) {
			params.set("magicKey", magicKeys[address]);
		}
		fetch(config.geocodeService + "/findAddressCandidates?" + params)
		.then(function (response) { return response.json(); })
		.then(function (data) {
			if (data.candidates && data.candidates.length > 0) {
				onPoint(new Point({x: data.candidates[0].location.x, y: data.candidates[0].location.y, spatialReference: mapElement.spatialReference}));
			}
		})
		.catch(function (error) { console.log("error", error); });
	});
}

// circle as a clockwise ring of points, in CIM frame coordinates (y up)
function circleRing (cx, cy, r) {
	var ring = [];
	for (var i = 0; i <= 48; i++) {
		var a = -2 * Math.PI * i / 48;
		ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
	}
	return ring;
}

// teardrop with its tip at (cx, tipY): a round head of radius r joined to the tip by tangent lines
function teardropRing (cx, cy, r, tipY) {
	var spread = Math.acos(r / (cy - tipY)),
		ring = [[cx, tipY]],
		// clockwise from the left tangent point, over the top, to the right tangent point
		from = -Math.PI / 2 - spread,
		to = -Math.PI / 2 + spread - 2 * Math.PI;
	for (var i = 0; i <= 48; i++) {
		var a = from + (to - from) * i / 48;
		ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
	}
	ring.push([cx, tipY]);
	return ring;
}

// one layer of the pin; every layer shares the 32 x 32 frame and is anchored at the tip
function pinMarker (ring, fillColor, stroke) {
	var layers = [{type: "CIMSolidFill", enable: true, color: fillColor}];
	if (stroke) {
		layers.unshift({type: "CIMSolidStroke", enable: true, width: stroke.width, color: stroke.color});
	}
	return {
		type: "CIMVectorMarker",
		enable: true,
		size: 32,
		frame: {xmin: 0, ymin: 0, xmax: 32, ymax: 32},
		anchorPoint: {x: 0, y: (1.4 - 16) / 32},
		anchorPointUnits: "Relative",
		markerGraphics: [{
			type: "CIMMarkerGraphic",
			geometry: {rings: [ring]},
			symbol: {type: "CIMPolygonSymbol", symbolLayers: layers}
		}]
	};
}

// map pin as a CIM symbol: the Calcite teardrop shape (pinTear) in the raleighnc.gov green, with a
// white center dot. Layers are listed top first; the drop shadow
// comes from pinGraphicsLayer's effect.
function searchPinSymbol () {
	var green = [65, 121, 37, 255],
		white = [255, 255, 255, 255],
		body = teardropRing(16, 21, 8.8, 1.4);
	return new CIMSymbol({
		data: {
			type: "CIMSymbolReference",
			symbol: {
				type: "CIMPointSymbol",
				symbolLayers: [
					pinMarker(circleRing(16, 21, 3.6), white),
					pinMarker(body, green, {width: 1.5, color: white})
				]
			}
		}
	});
}

function searchProperty (point) {
	pinGraphicsLayer.removeAll();
	pinGraphicsLayer.add(new Graphic({geometry: point, symbol: searchPinSymbol()}));
	getProperty(point);
}

function addPropertyByAddress (point) {
	var search = document.getElementById("addSearch");
	getAdjacentProperties(point, true);
	search.value = "";
	search.inputValue = "";
	search.replaceChildren();
}

var toolButtons = {measure: "measure", add: "addButton", remove: "removeButton"},
	instructions = {
		measure: "On the map, click or tap one edge of the right-of-way, then the opposite edge. You can also type the width below.",
		add: "Click or tap each property on the map to add it, then double-click or double-tap the last one to finish. You can also use Add a property by address below.",
		remove: "Click or tap a red property on the map to remove it, or use the Remove buttons under Selected properties below."
	};

function setMode (newMode) {
	mode = newMode;
	addPoints = [];
	measureStart = null;
	sketchLayer.removeAll();
	Object.keys(toolButtons).forEach(function (key) {
		document.getElementById(toolButtons[key]).appearance = (key === mode) ? "solid" : "outline";
	});
	var notice = document.getElementById("instructions");
	notice.open = !!instructions[mode];
	notice.querySelector("[slot=message]").textContent = instructions[mode] || "";
}

function removeProperty (event) {
	mapElement.hitTest(event, {include: [graphicsLayer]}).then(function (response) {
		if (response.results.length > 0) {
			removePin(response.results[0].graphic.attributes.PIN_NUM);
		}
	});
}

// the searched property (pins[0]) can't be removed
function removePin (pin) {
	if (pin == pins[0] || pins.indexOf(pin) === -1) {
		return;
	}
	graphicsLayer.graphics.toArray().forEach(function (graphic) {
		if (graphic.attributes.PIN_NUM === pin) {
			graphicsLayer.remove(graphic);
		}
	});
	pins.splice(pins.indexOf(pin), 1);
	for (var i = 0; i < labels.length; ++i) {
		if ((labels[i].pin === pin)) {
			labels.splice(i--, 1);
		}
	}
	renderSelectedList();
	updateResultStatus();
}

// visible count that is also announced by screen readers (role="status")
function updateResultStatus () {
	var parcels = pins.length,
		addresses = labels.length;
	document.getElementById("resultStatus").textContent =
		addresses + (addresses === 1 ? " mailing address" : " mailing addresses") + " from " +
		parcels + (parcels === 1 ? " property" : " properties") + " selected.";
}

function addProperty (event) {
	addPoints.push([event.mapPoint.x, event.mapPoint.y]);
	sketchLayer.add(new Graphic({
		geometry: event.mapPoint,
		symbol: {type: "simple-marker", color: [53, 172, 70], size: 8, outline: {color: [255, 255, 255], width: 1}}
	}));
}

function finishAdd () {
	if (addPoints.length > 0) {
		getAdjacentProperties(new Multipoint({points: addPoints, spatialReference: mapElement.spatialReference}), true);
	}
	addPoints = [];
	sketchLayer.removeAll();
}

function measureLine (start, end) {
	return new Polyline({paths: [[[start.x, start.y], [end.x, end.y]]], spatialReference: mapElement.spatialReference});
}

function measureClick (event) {
	if (!measureStart) {
		measureStart = event.mapPoint;
		return;
	}
	var length = distanceFeet(measureStart, event.mapPoint);
	setMode(null);
	document.getElementById("rowWidth").value = String(Math.round(length));
	applyRightOfWay(length);
}

// typed (keyboard) or measured right-of-way width, in feet
function applyRightOfWay (width) {
	var input = document.getElementById("rowWidth");
	if (!(width > 0)) {
		input.status = "invalid";
		input.validationMessage = "Enter the right-of-way width in feet.";
		return;
	}
	// a right-of-way as wide as the buffer distance or wider isn't counted
	if (width >= bufferDistance()) {
		input.status = "invalid";
		input.validationMessage = "Right-of-way is " + bufferDistance() + " feet or wider (the buffer distance), so no extra buffer is added.";
		return;
	}
	input.status = "idle";
	input.validationMessage = "";
	secondBuffer(bufferLayer.graphics.getItemAt(0), width);
}

function measureMove (event) {
	if (mode !== "measure" || !measureStart) {
		return;
	}
	var end = mapElement.toMap(event);
	if (!end) {
		return;
	}
	sketchLayer.removeAll();
	sketchLayer.add(new Graphic({
		geometry: measureLine(measureStart, end),
		symbol: new SimpleLineSymbol({style: "solid", color: [53, 172, 70], width: 3})
	}));
}

function secondBuffer(graphic, distance) {
	var geometry = bufferFeet(graphic.geometry, distance);
	if (bufferLayer.graphics.length > 1) {
		bufferLayer.remove(bufferLayer.graphics.getItemAt(1));
	}
	bufferLayer.add(new Graphic({geometry: geometry, symbol: SimpleFillSymbol.fromJSON(config.outerFill)}));
	mapElement.goTo(bufferLayer.graphics.toArray());
	getAdjacentProperties(geometry, false);
}

function labelField (value) {
	return (value === null || value === undefined) ? '' : String(value);
}

function downloadBlob (blob, filename) {
	var url = URL.createObjectURL(blob),
		a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function generateLabels () {
	if (labels.length === 0) {
		return;
	}
	// 3 x 10 labels per letter page, same layout as the old FPDF version
	var pdf = new window.jspdf.jsPDF({orientation: 'portrait', unit: 'in', format: 'letter'}),
		cellMargin = 0.0394, // FPDF default cell margin (1mm)
		lineHeight = 0.15,
		width = 2.4,
		baselineOffset = lineHeight / 2 + 0.3 * (8 / 72),
		row = 0,
		y = 0;
	pdf.setFont('helvetica', 'normal');
	pdf.setFontSize(8);

	labels.forEach(function (addr, i) {
		if (i % 30 === 0) {
			if (i > 0) {
				pdf.addPage();
			}
			row = 0;
		}
		var col = i % 3,
			x = 0.3 + (col * 2.6) + (col * 0.15),
			lines = [];
		if (col === 0) {
			y = 0.6 + row + 0.001;
			row++;
		}
		['pin', 'owner', 'addr1', 'addr2', 'addr3'].forEach(function (k) {
			lines = lines.concat(pdf.splitTextToSize(labelField(addr[k]), width - 2 * cellMargin));
		});
		lines.forEach(function (line, n) {
			pdf.text(line, x + cellMargin, y + n * lineHeight + baselineOffset);
		});
	});

	var pin = labelField(labels[0].pin || 'labels').replace(/[^A-Za-z0-9_-]/g, '');
	pdf.save('mail_list_' + pin + '.pdf');
}

function exportCsv () {
	if (labels.length === 0) {
		return;
	}
	var quote = function (value) {
			return '"' + labelField(value).replace(/"/g, '""') + '"';
		},
		result = "Owner,Address1,Address2,Address3\n";
	labels.forEach(function (addr) {
		result += [addr.owner, addr.addr1, addr.addr2, addr.addr3].map(quote).join(',') + "\n";
	});
	downloadBlob(new Blob([result], {type: 'text/csv;charset=utf-8'}), 'mailing_list_table.csv');
}

graphicsLayer = new GraphicsLayer();
// soft dark shadow keeps the bright cyan buffer readable over light parts of the basemap
bufferLayer = new GraphicsLayer({effect: "drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.4))"});
sketchLayer = new GraphicsLayer();
// the map's built-in graphics can't take effects, so the pin gets its own layer for the blurred shadow
pinGraphicsLayer = new GraphicsLayer({effect: "drop-shadow(1px 3px 3px rgba(0, 0, 0, 0.45))"});
mapElement = document.getElementById("map");
mapElement.map = new Map({
	basemap: {baseLayers: [new VectorTileLayer({portalItem: {id: config.map.basemap.portalItemId}})]},
	layers: [
		new FeatureLayer({url: config.propertyService + "/0", title: "Property", popupEnabled: false}),
		graphicsLayer,
		bufferLayer,
		sketchLayer,
		pinGraphicsLayer
	]
});
mapElement.spatialReference = SpatialReference.WebMercator;
mapElement.extent = projectOperator.execute(Extent.fromJSON(config.map.extent), SpatialReference.WebMercator);
mapElement.constraints = {rotationEnabled: false};

// map component events carry the view event in event.detail
mapElement.addEventListener("arcgisViewClick", function (event) {
	switch (mode) {
		case "add":
		addProperty(event.detail);
		break;
		case "remove":
		removeProperty(event.detail);
		break;
		case "measure":
		measureClick(event.detail);
		break;
	}
});

mapElement.addEventListener("arcgisViewDoubleClick", function (event) {
	if (mode === "add") {
		// finish the selection instead of zooming in; the map doesn't fire
		// a click for a double-click, so the double-clicked property is added here
		event.detail.stopPropagation();
		addProperty(event.detail);
		finishAdd();
	}
});

mapElement.addEventListener("arcgisViewPointerMove", function (event) {
	measureMove(event.detail);
});

document.getElementById("labelsButton").addEventListener("click", generateLabels);
document.getElementById("csvButton").addEventListener("click", exportCsv);

// clicking the active tool again turns it off
Object.keys(toolButtons).forEach(function (key) {
	document.getElementById(toolButtons[key]).addEventListener("click", function () {
		setMode(mode === key ? null : key);
	});
});

document.getElementById("rowApply").addEventListener("click", function () {
	applyRightOfWay(parseFloat(document.getElementById("rowWidth").value));
});
document.getElementById("rowWidth").addEventListener("keydown", function (event) {
	if (event.key === "Enter") {
		applyRightOfWay(parseFloat(document.getElementById("rowWidth").value));
	}
});

// help videos never autoplay; stop one when its popover closes
document.querySelectorAll("calcite-popover").forEach(function (popover) {
	popover.addEventListener("calcitePopoverClose", function () {
		popover.querySelectorAll("video").forEach(function (video) {
			video.pause();
		});
	});
});

// these links use href="#" so Enter activates them. Cancel the "#" navigation from window,
// after Calcite's document listener has handled the click (it ignores prevented clicks).
window.addEventListener("click", function (event) {
	if (event.composedPath().some(function (el) {
		return el.id === "searchHelp" || el.id === "measureHelp";
	})) {
		event.preventDefault();
	}
});

// changing the distance redraws the buffer around the searched property and reselects properties
function applyBufferDistance () {
	var input = document.getElementById("bufferDistance"),
		feet = parseFloat(input.value);
	if (!(feet > 0) || feet > 5280) {
		input.status = "invalid";
		input.validationMessage = "Enter a distance from 1 to 5,280 feet.";
		return;
	}
	input.status = "idle";
	input.validationMessage = "";
	if (subjectGeometry) {
		pins = [pins[0]];
		document.getElementById("rowWidth").value = "";
		buffer(subjectGeometry);
	}
}
document.getElementById("bufferDistance").addEventListener("calciteInputChange", applyBufferDistance);

// About opens on load unless the viewer chose "Don't show this again" (saved in this browser only)
var aboutDialog = document.getElementById("disclaimer"),
	hideAbout = document.getElementById("hideAbout"),
	hideAboutKey = "planMailList.hideAbout";
function readHideAbout () {
	try {
		return localStorage.getItem(hideAboutKey) === "1";
	} catch (error) {
		return false;
	}
}
function saveHideAbout (hide) {
	try {
		if (hide) {
			localStorage.setItem(hideAboutKey, "1");
		} else {
			localStorage.removeItem(hideAboutKey);
		}
	} catch (error) {
		// storage blocked (e.g. private browsing): the dialog will just show again next time
	}
}
hideAbout.checked = readHideAbout();
hideAbout.addEventListener("calciteCheckboxChange", function () {
	saveHideAbout(hideAbout.checked);
});
document.getElementById("aboutButton").addEventListener("click", function () {
	aboutDialog.open = true;
});
document.getElementById("disclaimerClose").addEventListener("click", function () {
	aboutDialog.open = false;
});
if (!hideAbout.checked) {
	aboutDialog.open = true;
}

createSearch(document.getElementById("addressSearch"), searchProperty);
createSearch(document.getElementById("addSearch"), addPropertyByAddress);
