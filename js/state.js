// shared app state
export const state = {
	// current map click mode: null, "add", "remove" or "measure"
	mode: null,
	// PINs of the selected properties; pins[0] is the searched property
	pins: [],
	// mailing label rows for the selected properties
	labels: [],
	// points clicked in Add mode, added together on double-click
	addPoints: [],
	// site address of each selected property, by PIN
	siteAddresses: {},
	// searched property's geometry, kept so the buffer can be redrawn at a new distance
	subjectGeometry: null
};
