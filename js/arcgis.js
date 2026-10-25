// ArcGIS Maps SDK modules, loaded through the SDK's own loader (js.arcgis.com/5.1 in index.html)
export const [
	Map, VectorTileLayer, FeatureLayer, GraphicsLayer, Graphic, Point, Multipoint, Extent, SpatialReference,
	SimpleFillSymbol, CIMSymbol, Query, query, bufferOperator, projectOperator, unionOperator, containsOperator, SketchViewModel
] = await $arcgis.import([
	"@arcgis/core/Map.js",
	"@arcgis/core/layers/VectorTileLayer.js",
	"@arcgis/core/layers/FeatureLayer.js",
	"@arcgis/core/layers/GraphicsLayer.js",
	"@arcgis/core/Graphic.js",
	"@arcgis/core/geometry/Point.js",
	"@arcgis/core/geometry/Multipoint.js",
	"@arcgis/core/geometry/Extent.js",
	"@arcgis/core/geometry/SpatialReference.js",
	"@arcgis/core/symbols/SimpleFillSymbol.js",
	"@arcgis/core/symbols/CIMSymbol.js",
	"@arcgis/core/rest/support/Query.js",
	"@arcgis/core/rest/query.js",
	"@arcgis/core/geometry/operators/bufferOperator.js",
	"@arcgis/core/geometry/operators/projectOperator.js",
	"@arcgis/core/geometry/operators/unionOperator.js",
	"@arcgis/core/geometry/operators/containsOperator.js",
	"@arcgis/core/widgets/Sketch/SketchViewModel.js"
]);
await projectOperator.load();
