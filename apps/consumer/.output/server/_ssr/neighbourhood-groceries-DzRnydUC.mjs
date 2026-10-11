import { n as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/neighbourhood-groceries-DzRnydUC.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var colors = {
	in_stock: "#18834b",
	low: "#d68a12",
	out: "#bc3a3a"
};
function ShopMap({ shops, selectedId, onSelect }) {
	const container = (0, import_react.useRef)(null);
	const map = (0, import_react.useRef)(null);
	const markers = (0, import_react.useRef)(/* @__PURE__ */ new Map());
	const positioned = (0, import_react.useMemo)(() => shops.filter((shop) => shop.coordinates), [shops]);
	const selectRef = (0, import_react.useRef)(onSelect);
	(0, import_react.useEffect)(() => {
		selectRef.current = onSelect;
	}, [onSelect]);
	(0, import_react.useEffect)(() => {
		let disposed = false;
		let cleanup;
		import("../_libs/leaflet.mjs").then((n) => /* @__PURE__ */ __toESM(n.t())).then((L) => {
			if (disposed || !container.current || positioned.length === 0) return;
			const leafletMap = L.map(container.current, {
				scrollWheelZoom: false,
				zoomControl: true,
				attributionControl: true
			});
			map.current = leafletMap;
			L.tileLayer({
				"BASE_URL": "/",
				"DEV": false,
				"MODE": "production",
				"PROD": true,
				"SSR": true,
				"TSS_DEV_SERVER": "false",
				"TSS_DEV_SSR_STYLES_BASEPATH": "/",
				"TSS_DEV_SSR_STYLES_ENABLED": "true",
				"TSS_DISABLE_CSRF_MIDDLEWARE_WARNING": "false",
				"TSS_INLINE_CSS_ENABLED": "false",
				"TSS_ROUTER_BASEPATH": "",
				"TSS_SERVER_FN_BASE": "/_serverFn/"
			}["VITE_MAP_TILE_URL"] || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
				maxZoom: 19,
				attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"
			}).addTo(leafletMap);
			const layer = L.featureGroup().addTo(leafletMap);
			for (const shop of positioned) {
				if (!shop.coordinates) continue;
				const statusList = shop.statuses ?? [];
				const uniqueStatuses = [...new Set(statusList)];
				const color = uniqueStatuses.length === 1 ? colors[uniqueStatuses[0]] : "#52635a";
				const marker = L.circleMarker([shop.coordinates.latitude, shop.coordinates.longitude], {
					radius: 9,
					color: "#fff",
					weight: 2,
					fillColor: color,
					fillOpacity: 1
				}).addTo(layer);
				marker.bindTooltip(shop.name, { direction: "top" });
				marker.on("click", () => selectRef.current(shop.id));
				markers.current.set(shop.id, marker);
			}
			leafletMap.fitBounds(layer.getBounds().pad(.2), { maxZoom: 14 });
			cleanup = () => {
				markers.current.clear();
				leafletMap.remove();
				map.current = null;
			};
		});
		return () => {
			disposed = true;
			cleanup?.();
		};
	}, [positioned]);
	(0, import_react.useEffect)(() => {
		const marker = selectedId ? markers.current.get(selectedId) : void 0;
		if (marker) marker.openTooltip();
	}, [selectedId, positioned]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "shop-map-wrap",
		children: [positioned.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: container,
				className: "shop-map",
				role: "region",
				"aria-label": "Map of nearby shops"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "map-legend",
				"aria-label": "Availability marker key",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "in_stock" }), "In stock"] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "low" }), "Low"] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "out" }), "Out"] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "mixed" }), "Mixed or not applicable"] })
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "sr-only",
				children: [positioned.length, " shops shown on map."]
			})
		] }), !positioned.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "map-note",
			children: "No shops in these results have saved map coordinates. The accessible shop list is below."
		})]
	});
}
function resultMapShops(results) {
	const byId = /* @__PURE__ */ new Map();
	for (const result of results) {
		const current = byId.get(result.id) ?? {
			...result,
			statuses: []
		};
		current.statuses = [.../* @__PURE__ */ new Set([...current.statuses ?? [], result.status])];
		byId.set(result.id, current);
	}
	return [...byId.values()];
}
var neighbourhood_groceries_default = "/assets/neighbourhood-groceries-C-BPe3sI.jpg";
//#endregion
export { neighbourhood_groceries_default as n, resultMapShops as r, ShopMap as t };
