import { config } from "./config.js";
import { Point } from "./arcgis.js";
import { mapElement } from "./map.js";
import { jurisdiction, inJurisdiction } from "./jurisdiction.js";

// suggestions and matches are limited to the jurisdiction's bounding box; the exact boundary is checked on select
const searchExtent = jurisdiction ? {searchExtent: JSON.stringify(jurisdiction.extent.toJSON())} : {};

const geocode = async (operation, params) => {
	const response = await fetch(`${config.geocodeService}/${operation}?${new URLSearchParams({f: "json", ...params})}`);
	return response.json();
};

// address autocomplete backed by the City geocoder; onPoint receives the matched location
export const createSearch = (search, onPoint) => {
	const cache = {};
	const magicKeys = {};
	let searching;

	const showSuggestions = (suggestions) => {
		search.replaceChildren();
		for (const {text, magicKey} of suggestions) {
			const item = document.createElement("calcite-autocomplete-item");
			item.heading = text;
			item.value = text;
			item.label = text;
			magicKeys[text] = magicKey;
			search.appendChild(item);
		}
	};

	search.addEventListener("calciteAutocompleteTextInput", () => {
		const text = search.inputValue;
		search.status = "idle";
		search.validationMessage = "";
		clearTimeout(searching);
		if (text.length < 4) {
			search.replaceChildren();
			return;
		}
		if (cache[text]) {
			showSuggestions(cache[text]);
			return;
		}
		searching = setTimeout(async () => {
			try {
				const data = await geocode("suggest", {text, ...searchExtent});
				cache[text] = data.suggestions ?? [];
				// ignore responses for text the user has already changed
				if (search.inputValue === text) {
					showSuggestions(cache[text]);
				}
			} catch (error) {
				console.error(error);
			}
		}, 500);
	});

	search.addEventListener("calciteAutocompleteChange", async () => {
		const address = search.value;
		if (!address) {
			return;
		}
		search.inputValue = address;
		try {
			const data = await geocode("findAddressCandidates", {
				outSR: mapElement.spatialReference.wkid,
				SingleLine: address,
				...searchExtent,
				...(magicKeys[address] ? {magicKey: magicKeys[address]} : {})
			});
			const location = data.candidates?.[0]?.location;
			if (!location) {
				return;
			}
			const point = new Point({x: location.x, y: location.y, spatialReference: mapElement.spatialReference});
			if (!inJurisdiction(point)) {
				search.status = "invalid";
				search.validationMessage = "This address is outside Raleigh's planning jurisdiction.";
				return;
			}
			onPoint(point);
		} catch (error) {
			console.error(error);
		}
	});
};
