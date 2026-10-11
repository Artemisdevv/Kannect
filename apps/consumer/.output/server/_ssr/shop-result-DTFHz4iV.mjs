import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { E as ArrowUpRight, i as Store, p as Minus, t as X, w as Check } from "../_libs/lucide-react.mjs";
import { i as distanceKm, s as rupees, t as Button } from "./shopper-shell-CSur-y61.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/shop-result-DTFHz4iV.js
var import_jsx_runtime = require_jsx_runtime();
function Availability({ status }) {
	const Icon = status === "in_stock" ? Check : status === "low" ? Minus : X;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: `availability ${status}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { size: 11 }), status === "in_stock" ? "In stock" : status === "low" ? "Low" : "Out"]
	});
}
function ShopCard({ shop, selected = false, onSelect }) {
	const km = distanceKm(shop.distanceM);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: `shop-card${selected ? " selected" : ""}`,
		onFocus: onSelect,
		onMouseEnter: onSelect,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "shop-art",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Store, {})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: shop.name }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
						shop.product.name,
						shop.product.size ? ` · ${shop.product.size}` : "",
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-foreground font-semibold",
							children: rupees(shop.price)
						})
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "shop-meta",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Availability, { status: shop.status }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
							km !== null ? `${km.toFixed(1)} km away` : shop.address || "Distance unavailable",
							" ",
							"· Reported availability"
						] })]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "ghost",
				size: "icon",
				asChild: true,
				title: `View ${shop.name}`,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/shops/$shopId",
					params: { shopId: shop.id },
					"aria-label": `View ${shop.name}`,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUpRight, {})
				})
			})
		]
	});
}
function NearbyShopCard({ shop, selected = false, onSelect }) {
	const km = distanceKm(shop.distanceM);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: `shop-card nearby-shop-card${selected ? " selected" : ""}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			className: "nearby-selection",
			onClick: onSelect,
			"aria-pressed": selected,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "shop-art",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Store, {})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "min-w-0 text-left",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: shop.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [shop.address || "Address not listed", km !== null ? ` · ${km.toFixed(1)} km away` : ""] })]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			variant: "ghost",
			size: "icon",
			asChild: true,
			title: `View ${shop.name}`,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: "/shops/$shopId",
				params: { shopId: shop.id },
				"aria-label": `View ${shop.name}`,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUpRight, {})
			})
		})]
	});
}
//#endregion
export { NearbyShopCard as n, ShopCard as r, Availability as t };
