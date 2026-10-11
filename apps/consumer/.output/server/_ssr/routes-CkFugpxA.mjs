import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { c as Search, g as MapPin, i as Store, s as ShieldCheck, v as LoaderCircle } from "../_libs/lucide-react.mjs";
import { c as useShopper, t as Button } from "./shopper-shell-CSur-y61.mjs";
import { n as NearbyShopCard } from "./shop-result-DTFHz4iV.mjs";
import { n as neighbourhood_groceries_default, t as ShopMap } from "./neighbourhood-groceries-DzRnydUC.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CkFugpxA.js
var import_jsx_runtime = require_jsx_runtime();
function NearbyPage() {
	const { area, nearby, nearbyError, nearbyLoading, setLocationOpen, selectedShopId, selectShop } = useShopper();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "app-main",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "welcome",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "eyebrow",
					children: "A little closer. A little easier."
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", { children: ["Your neighbourhood, ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "nearby." })] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "intro-photo",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: neighbourhood_groceries_default,
					alt: "Fresh vegetables, fruit, milk and rice from a neighbourhood grocery shop",
					width: 1536,
					height: 768,
					fetchPriority: "high"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "intro-photo-copy",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", { children: [
						"Everyday needs.",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
						"Nearby shops."
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: area })]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "section-heading",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Shops around you" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
					area,
					" · ",
					nearby.length,
					" shops"
				] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					size: "icon",
					"aria-label": "Change neighbourhood",
					onClick: () => setLocationOpen(true),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, {})
				})]
			}),
			nearbyLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "empty-state",
				role: "status",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "animate-spin" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Finding nearby shops…" })]
			}) : nearbyError ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "empty-state",
				role: "alert",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Store, {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Nearby shops couldn’t load" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: nearbyError }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						onClick: () => setLocationOpen(true),
						children: "Choose another area"
					})
				]
			}) : nearby.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShopMap, {
				shops: nearby,
				selectedId: selectedShopId,
				onSelect: selectShop
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "shop-list",
				"aria-label": "Nearby shops",
				children: nearby.map((shop) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NearbyShopCard, {
					shop,
					selected: selectedShopId === shop.id,
					onSelect: () => selectShop(shop.id)
				}, shop.id))
			})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "empty-state",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Store, {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "No shops found in this area" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Try another area or use your location to look nearby." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						onClick: () => setLocationOpen(true),
						children: "Change area"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				asChild: true,
				className: "mt-6 w-full",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/search",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {}), "Find an item"]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "trust-note",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { size: 14 }), "No account needed. Your coordinates are used for this request and aren’t saved by this app."]
			})
		]
	});
}
//#endregion
export { NearbyPage as component };
