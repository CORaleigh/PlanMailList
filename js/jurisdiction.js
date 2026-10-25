import { config } from "./config.js";
import { Query, query, SpatialReference, unionOperator, containsOperator } from "./arcgis.js";

// Raleigh's planning jurisdiction as one Web Mercator polygon, or null if it couldn't be loaded,
// in which case search and navigation simply aren't limited
export const jurisdiction = await (async () => {
	try {
		const {features} = await query.executeQueryJSON(config.jurisdictionService, new Query({
			where: `JURISDICTION = '${config.jurisdictionName}'`,
			returnGeometry: true,
			outSpatialReference: SpatialReference.WebMercator
		}));
		return features.length ? unionOperator.executeMany(features.map(feature => feature.geometry)) : null;
	} catch (error) {
		console.error(error);
		return null;
	}
})();

export const inJurisdiction = (point) => !jurisdiction || containsOperator.execute(jurisdiction, point);
