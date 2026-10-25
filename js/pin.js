import { CIMSymbol } from "./arcgis.js";

// circle as a clockwise ring of points, in CIM frame coordinates (y up)
const circleRing = (cx, cy, r) => {
	const ring = [];
	for (let i = 0; i <= 48; i++) {
		const a = -2 * Math.PI * i / 48;
		ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
	}
	return ring;
};

// teardrop with its tip at (cx, tipY): a round head of radius r joined to the tip by tangent lines
const teardropRing = (cx, cy, r, tipY) => {
	const spread = Math.acos(r / (cy - tipY));
	const ring = [[cx, tipY]];
	// clockwise from the left tangent point, over the top, to the right tangent point
	const from = -Math.PI / 2 - spread;
	const to = -Math.PI / 2 + spread - 2 * Math.PI;
	for (let i = 0; i <= 48; i++) {
		const a = from + (to - from) * i / 48;
		ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
	}
	ring.push([cx, tipY]);
	return ring;
};

// one layer of the pin; every layer shares the 32 x 32 frame and is anchored at the tip
const pinMarker = (ring, fillColor, stroke) => ({
	type: "CIMVectorMarker",
	enable: true,
	size: 32,
	frame: {xmin: 0, ymin: 0, xmax: 32, ymax: 32},
	anchorPoint: {x: 0, y: (1.4 - 16) / 32},
	anchorPointUnits: "Relative",
	markerGraphics: [{
		type: "CIMMarkerGraphic",
		geometry: {rings: [ring]},
		symbol: {
			type: "CIMPolygonSymbol",
			symbolLayers: [
				...(stroke ? [{type: "CIMSolidStroke", enable: true, width: stroke.width, color: stroke.color}] : []),
				{type: "CIMSolidFill", enable: true, color: fillColor}
			]
		}
	}]
});

// map pin as a CIM symbol: the Calcite teardrop shape (pinTear) in the raleighnc.gov green, with a
// white center dot. Layers are listed top first; the drop shadow comes from pinLayer's effect.
export const searchPinSymbol = () => {
	const green = [65, 121, 37, 255];
	const white = [255, 255, 255, 255];
	return new CIMSymbol({
		data: {
			type: "CIMSymbolReference",
			symbol: {
				type: "CIMPointSymbol",
				symbolLayers: [
					pinMarker(circleRing(16, 21, 3.6), white),
					pinMarker(teardropRing(16, 21, 8.8, 1.4), green, {width: 1.5, color: white})
				]
			}
		}
	});
};
