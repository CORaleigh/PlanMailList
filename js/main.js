var config = {
	map:{
		// Esri Community vector basemap (public item, Web Mercator)
		basemap: {portalItemId: "273bf8d5c8ac400183fc24e109d20bcf"},
		extent: {xmin: 2049000, ymin: 714000, xmax: 2159000, ymax:814000, spatialReference: {wkid: 2264}}
	},
	addressService:"https://maps.raleighnc.gov/arcgis/rest/services/Addresses/MapServer/0/query",
    propertyService:"https://maps.raleighnc.gov/arcgis/rest/services/Property/Property//MapServer",
    //mailListService:"https://maps.raleighnc.gov/arcgis/rest/services/Parcels/MapServer/exts/PropertySOE/RealEstateSearch",
    mailListService:"https://maps.raleighnc.gov/arcgis/rest/services/Property/Property/MapServer/1",
    geocodeService:"https://maps.raleighnc.gov/arcgis/rest/services/Locators/FindMyService/GeocodeServer",
    outerFill: {
        type: "esriSFS",
        style: "esriSFSNull",
        color: [255, 255, 0],
        outline: {
            type: "esriSLS",
            style: "esriSLSDash",
            color: [228, 255, 0],
            width: 4
        }
    },
    innerFill: {
        type: "esriSFS",
        style: "esriSFSNull",
        color: [255, 0, 0],
        outline: {
            type: "esriSLS",
            style: "esriSLSSolid",
            color: [228, 255, 0],
            width: 4
        }
    },
    propertyFill: {
        type: "esriSFS",
        style: "esriSFSSolid",
        color: [255, 0, 0, 0],
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
	Map, MapView, VectorTileLayer, FeatureLayer, GraphicsLayer, Graphic, Point, Multipoint, Polyline, Extent, SpatialReference,
	SimpleFillSymbol, SimpleLineSymbol, PictureMarkerSymbol, Query, query, bufferOperator, projectOperator
] = await $arcgis.import([
	"@arcgis/core/Map.js",
	"@arcgis/core/views/MapView.js",
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
	"@arcgis/core/symbols/PictureMarkerSymbol.js",
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
	return projectOperator.execute(buffered, view.spatialReference);
}

function distanceFeet (start, end) {
	var a = projectOperator.execute(start, statePlane),
		b = projectOperator.execute(end, statePlane);
	return Math.hypot(b.x - a.x, b.y - a.y);
}

var view, graphicsLayer, bufferLayer, sketchLayer, labels = [], pins = [],
	// current map click mode: null, "add", "remove" or "measure"
	mode = null,
	addPoints = [],
	measureStart = null;

function getMailingAddresses (pins) {
	var where = "PIN_NUM IN (" + pins.map(function (pin) {
		return "'" + pin + "'";
	}).join(",") + ")";
	query.executeQueryJSON(config.mailListService, new Query({where: where, outFields: ['*']}))
	.then(function(data) {
		var label = {},
			tbody = document.querySelector("#addressTable tbody");
		labels = [];
		if (tbody) {
			tbody.replaceChildren();
		}

		data.features.forEach(function(feature) {
			var account = feature.attributes,
				owner = account.OWNER;
			if (owner.length > 50) {
				owner = owner.substring(0,50) + "...";
			}
			label = {owner:owner, addr1:account.ADDR1,addr2:account.ADDR2,addr3:account.ADDR3,addr: account.ADDR1+"\n"+account.ADDR2+"\n"+account.ADDR3, pin:account.PIN_NUM};
			if (account.PIN_NUM === pins[0]) {
				labels.unshift(label);
			} else {
				labels.push(label);
			}
			if (tbody) {
				var tr = tbody.insertRow();
				tr.dataset.pin = account.PIN_NUM;
				tr.insertCell().textContent = owner;
				tr.insertCell().textContent = label.addr;
				tr.addEventListener("mouseover", function () {
					highlightProperty(account.PIN_NUM);
				});
			}
		});
		document.querySelectorAll(".postsearch").forEach(function (el) {
			el.hidden = false;
		});
		console.log("success");
	})
	.catch(function(error) {
		console.log("error", error);
	});
}

function highlightProperty (pin) {
	graphicsLayer.graphics.forEach(function (graphic) {
		var symbol = graphic.symbol.clone();
		symbol.color = (graphic.attributes.PIN_NUM === pin) ? [255, 0, 0, 0.60] : [255, 0, 0, 0];
		graphic.symbol = symbol;
	});
}

function queryProperties (geometry) {
	var q = new Query({
		geometry: geometry,
		outFields: ['PIN_NUM'],
		returnGeometry: true,
		outSpatialReference: view.spatialReference
	});
	return query.executeQueryJSON(config.propertyService + "/0", q);
}

function getAdjacentProperties (geometry, add) {
	if (!add) {
		graphicsLayer.removeAll();
	}
	queryProperties(geometry).then(function (featureSet) {
		featureSet.features.forEach(function (feature) {
			if (pins.indexOf(feature.attributes.PIN_NUM) === -1) {
				pins.push(feature.attributes.PIN_NUM);
			}
			feature.symbol = SimpleFillSymbol.fromJSON(config.propertyFill);
			graphicsLayer.add(feature);
		});
		getMailingAddresses(pins);
	});
}

function buffer (property) {
	var geometry = bufferFeet(property, 100);
	bufferLayer.removeAll();
	bufferLayer.add(new Graphic({geometry: geometry, symbol: SimpleFillSymbol.fromJSON(config.innerFill)}));
	view.goTo(bufferLayer.graphics.toArray());
	getAdjacentProperties(geometry, false);
}

function getProperty (point) {
	pins = [];
	queryProperties(point).then(function (featureSet) {
		if (featureSet.features.length > 0) {
			pins.push(featureSet.features[0].attributes.PIN_NUM);
			buffer(featureSet.features[0].geometry);
		}
	});
}

function createSearch () {
	var search = document.getElementById("addressSearch"),
		cache = {},
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
		var params = new URLSearchParams({f: "json", outSR: view.spatialReference.wkid, SingleLine: address});
		if (magicKeys[address]) {
			params.set("magicKey", magicKeys[address]);
		}
		fetch(config.geocodeService + "/findAddressCandidates?" + params)
		.then(function (response) { return response.json(); })
		.then(function (data) {
			if (data.candidates && data.candidates.length > 0) {
				var point = new Point({x: data.candidates[0].location.x, y: data.candidates[0].location.y, spatialReference: view.spatialReference});
				view.graphics.removeAll();
				view.graphics.add(new Graphic({geometry: point, symbol: new PictureMarkerSymbol({url: "img/pin.png", width: "40px", height: "40px"})}));
				getProperty(point);
			}
		})
		.catch(function (error) { console.log("error", error); });
	});
}

var toolButtons = {measure: "measure", add: "addButton", remove: "removeButton"},
	instructions = {
		measure: "Click on one side of the right-of-way, then click on the other side.",
		add: "Single click on each property to add, double click on last property to finish selection.",
		remove: "Single click each red property to remove from selection."
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
	view.hitTest(event, {include: [graphicsLayer]}).then(function (response) {
		if (response.results.length === 0) {
			return;
		}
		var graphic = response.results[0].graphic,
			pin = graphic.attributes.PIN_NUM;
		if (pin != pins[0]) {
			graphicsLayer.remove(graphic);
			pins.splice(pins.indexOf(pin), 1);
			for (var i = 0; i < labels.length; ++i) {
				if ((labels[i].pin === pin)) {
					labels.splice(i--, 1);
				}
			}

			document.querySelectorAll("tr").forEach(function (tr) {
				if (tr.dataset.pin === pin) {
					tr.remove();
				}
			});
		}
	});
}

function addProperty (event) {
	addPoints.push([event.mapPoint.x, event.mapPoint.y]);
	sketchLayer.add(new Graphic({
		geometry: event.mapPoint,
		symbol: {type: "simple-marker", color: [0, 255, 0], size: 8, outline: {color: [255, 255, 255], width: 1}}
	}));
}

function finishAdd () {
	if (addPoints.length > 0) {
		getAdjacentProperties(new Multipoint({points: addPoints, spatialReference: view.spatialReference}), true);
	}
	addPoints = [];
	sketchLayer.removeAll();
}

function measureLine (start, end) {
	return new Polyline({paths: [[[start.x, start.y], [end.x, end.y]]], spatialReference: view.spatialReference});
}

function measureClick (event) {
	if (!measureStart) {
		measureStart = event.mapPoint;
		return;
	}
	var length = distanceFeet(measureStart, event.mapPoint);
	setMode(null);
	if (length < 100) {
		secondBuffer(bufferLayer.graphics.getItemAt(0), length);
	} else {
		alert('Right-of-Way width is greater than 100 feet.')
	}
}

function measureMove (event) {
	if (mode !== "measure" || !measureStart) {
		return;
	}
	var end = view.toMap(event);
	if (!end) {
		return;
	}
	sketchLayer.removeAll();
	sketchLayer.add(new Graphic({
		geometry: measureLine(measureStart, end),
		symbol: new SimpleLineSymbol({style: "solid", color: [0, 255, 0], width: 3})
	}));
}

function secondBuffer(graphic, distance) {
	var geometry = bufferFeet(graphic.geometry, distance);
	if (bufferLayer.graphics.length > 1) {
		bufferLayer.remove(bufferLayer.graphics.getItemAt(1));
	}
	bufferLayer.add(new Graphic({geometry: geometry, symbol: SimpleFillSymbol.fromJSON(config.outerFill)}));
	view.goTo(bufferLayer.graphics.toArray());
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
	downloadBlob(new Blob([result], {type: 'text/csv;charset=utf-8'}), 'tabledata.csv');
}

graphicsLayer = new GraphicsLayer();
bufferLayer = new GraphicsLayer();
sketchLayer = new GraphicsLayer();
view = new MapView({
	container: "map",
	map: new Map({
		basemap: {baseLayers: [new VectorTileLayer({portalItem: {id: config.map.basemap.portalItemId}})]},
		layers: [
			new FeatureLayer({url: config.propertyService + "/0", title: "Property", popupEnabled: false}),
			graphicsLayer,
			bufferLayer,
			sketchLayer
		]
	}),
	extent: projectOperator.execute(Extent.fromJSON(config.map.extent), SpatialReference.WebMercator),
	spatialReference: SpatialReference.WebMercator,
	constraints: {rotationEnabled: false}
});

view.on("click", function (event) {
	switch (mode) {
		case "add":
		addProperty(event);
		break;
		case "remove":
		removeProperty(event);
		break;
		case "measure":
		measureClick(event);
		break;
	}
});

view.on("double-click", function (event) {
	if (mode === "add") {
		// finish the selection instead of zooming in; the view doesn't fire
		// "click" for a double-click, so the double-clicked property is added here
		event.stopPropagation();
		addProperty(event);
		finishAdd();
	}
});

view.on("pointer-move", measureMove);

document.getElementById("labelsButton").addEventListener("click", generateLabels);
document.getElementById("csvButton").addEventListener("click", exportCsv);

// clicking the active tool again turns it off
Object.keys(toolButtons).forEach(function (key) {
	document.getElementById(toolButtons[key]).addEventListener("click", function () {
		setMode(mode === key ? null : key);
	});
});

document.getElementById("disclaimerLink").addEventListener("click", function () {
	document.getElementById("disclaimer").open = true;
});
document.getElementById("disclaimerClose").addEventListener("click", function () {
	document.getElementById("disclaimer").open = false;
});

createSearch();
