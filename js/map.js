import { config } from "./config.js";
import { Map, VectorTileLayer, FeatureLayer, GraphicsLayer, Extent, SpatialReference, bufferOperator, projectOperator } from "./arcgis.js";
import { jurisdiction } from "./jurisdiction.js";

export const parcelLayer = new FeatureLayer({url: `${config.propertyService}/0`, title: "Property", popupEnabled: false});
// red outlines of the selected properties
export const selectionLayer = new GraphicsLayer();
// soft dark shadow keeps the bright cyan buffer readable over light parts of the basemap
export const bufferLayer = new GraphicsLayer({effect: "drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.4))"});
// Add mode markers and the measure line
export const sketchLayer = new GraphicsLayer();
// the map's built-in graphics can't take effects, so the pin gets its own layer for the blurred shadow
export const pinLayer = new GraphicsLayer({effect: "drop-shadow(1px 3px 3px rgba(0, 0, 0, 0.45))"});

export const mapElement = document.getElementById("map");
mapElement.map = new Map({
	basemap: {baseLayers: [new VectorTileLayer({portalItem: {id: config.map.basemap.portalItemId}})]},
	layers: [parcelLayer, selectionLayer, bufferLayer, sketchLayer, pinLayer]
});
mapElement.spatialReference = SpatialReference.WebMercator;
mapElement.extent = jurisdiction?.extent ?? projectOperator.execute(Extent.fromJSON(config.map.extent), SpatialReference.WebMercator);
mapElement.constraints = {
	rotationEnabled: false,
	// keep panning within the jurisdiction (with some margin) and stop zooming out past the county
	...(jurisdiction ? {geometry: jurisdiction.extent.clone().expand(1.2), minScale: 600000} : {})
};

// The basemap is Web Mercator, which stretches distances by ~23% at Raleigh's latitude,
// so buffers and measurements are done in NC State Plane (US feet) like the parcel data.
const statePlane = new SpatialReference({wkid: 2264});

export const bufferFeet = (geometry, feet) => {
	const buffered = bufferOperator.execute(projectOperator.execute(geometry, statePlane), feet, {unit: "feet"});
	return projectOperator.execute(buffered, mapElement.spatialReference);
};

export const distanceFeet = (start, end) => {
	const a = projectOperator.execute(start, statePlane);
	const b = projectOperator.execute(end, statePlane);
	return Math.hypot(b.x - a.x, b.y - a.y);
};
