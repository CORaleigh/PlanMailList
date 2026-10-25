export const config = {
	map: {
		// Esri Community vector basemap (public item, Web Mercator)
		basemap: {portalItemId: "273bf8d5c8ac400183fc24e109d20bcf"},
		extent: {xmin: 2049000, ymin: 714000, xmax: 2159000, ymax: 814000, spatialReference: {wkid: 2264}}
	},
	propertyService: "https://maps.raleighnc.gov/arcgis/rest/services/Property/Property//MapServer",
	mailListService: "https://maps.raleighnc.gov/arcgis/rest/services/Property/Property/MapServer/1",
	geocodeService: "https://maps.raleighnc.gov/arcgis/rest/services/Locators/FindMyService/GeocodeServer",
	// Raleigh's planning jurisdiction (city limits + ETJ) limits address search and map navigation
	jurisdictionService: "https://maps.raleighnc.gov/arcgis/rest/services/Planning/Jurisdictions/MapServer/1",
	jurisdictionName: "RALEIGH",
	outerFill: {
		type: "esriSFS",
		style: "esriSFSNull",
		color: [255, 255, 0],
		outline: {type: "esriSLS", style: "esriSLSDash", color: [0, 255, 255], width: 3}
	},
	innerFill: {
		type: "esriSFS",
		style: "esriSFSNull",
		color: [255, 0, 0],
		outline: {type: "esriSLS", style: "esriSLSSolid", color: [0, 255, 255], width: 3}
	},
	propertyFill: {
		type: "esriSFS",
		style: "esriSFSSolid",
		color: [255, 0, 0, 26],
		outline: {type: "esriSLS", style: "esriSLSSolid", color: [255, 0, 0], width: 2}
	}
};
