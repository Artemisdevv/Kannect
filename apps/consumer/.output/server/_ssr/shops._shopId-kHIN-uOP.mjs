import { n as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { b as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { O as ArrowLeft, d as Phone, f as Navigation, g as MapPin, i as Store, v as LoaderCircle, x as Info } from "../_libs/lucide-react.mjs";
import { a as fetchReferral, c as useShopper, i as distanceKm, o as fetchShopPage, s as rupees, t as Button } from "./shopper-shell-CSur-y61.mjs";
import { t as Route } from "./shops._shopId-DSAZrr3t.mjs";
import { r as ShopCard, t as Availability } from "./shop-result-DTFHz4iV.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/shops._shopId-kHIN-uOP.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ShopDetail() {
	const { shopId } = Route.useParams();
	const { response } = useShopper();
	const searchResult = response?.shops.find((item) => item.id === shopId);
	const [page, setPage] = (0, import_react.useState)(null);
	const [referral, setReferral] = (0, import_react.useState)(null);
	const [loading, setLoading] = (0, import_react.useState)(true);
	const [referralLoading, setReferralLoading] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	const [referralError, setReferralError] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		const controller = new AbortController();
		setLoading(true);
		setError("");
		setPage(null);
		fetchShopPage(shopId, response?.shops.find((item) => item.id === shopId)?.product.name, controller.signal).then(setPage).catch((e) => {
			if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Shop details couldn’t load.");
		}).finally(() => {
			if (!controller.signal.aborted) setLoading(false);
		});
		return () => controller.abort();
	}, [shopId, response]);
	const displayed = page?.products.find((item) => item.product.id === searchResult?.product.id);
	const referralProduct = searchResult?.status === "out" ? searchResult : page?.products.find((item) => item.status === "out");
	const referralProductId = referralProduct?.product.id;
	(0, import_react.useEffect)(() => {
		if (!referralProductId) {
			setReferral(null);
			return;
		}
		const controller = new AbortController();
		setReferralLoading(true);
		setReferralError("");
		setReferral(null);
		fetchReferral(shopId, referralProductId, controller.signal).then(setReferral).catch((e) => {
			if (!controller.signal.aborted) setReferralError(e instanceof Error ? e.message : "Nearby alternatives couldn’t load.");
		}).finally(() => {
			if (!controller.signal.aborted) setReferralLoading(false);
		});
		return () => controller.abort();
	}, [shopId, referralProductId]);
	if (loading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "app-main",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "empty-state",
			role: "status",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "animate-spin" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "Loading shop details…" })]
		})
	});
	if (error || !page) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "app-main",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "empty-state",
			role: "alert",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Store, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "Shop details unavailable" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: error || "The shop response was incomplete." }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/",
						children: "Back to nearby shops"
					})
				})
			]
		})
	});
	const shop = page.shop;
	const km = distanceKm(searchResult?.distanceM ?? null);
	const mapsUrl = shop.coordinates ? `https://www.google.com/maps/dir/?api=1&destination=${shop.coordinates.latitude},${shop.coordinates.longitude}` : void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "app-main",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "ghost",
				asChild: true,
				className: "-ml-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: searchResult ? "/search" : "/",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, {}), searchResult ? "Back to results" : "Back to nearby shops"]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "detail-header",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "detail-symbol",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Store, {})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: shop.name }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [shop.address || "Address not listed", km !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
						km.toFixed(1),
						" km away"
					] })] }),
					shop.phone && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
						className: "shop-contact",
						href: `tel:${shop.phone}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Phone, { size: 15 }), shop.phone]
					})
				]
			}),
			searchResult ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "detail-product",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", { children: [searchResult.product.name, searchResult.product.size ? ` · ${searchResult.product.size}` : ""] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Availability, { status: displayed?.status ?? searchResult.status }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Reported availability · May change" })
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "detail-price",
					children: rupees(displayed?.price ?? searchResult.price)
				})]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "section-heading",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Products reported here" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [page.products.length, " products"] })]
			}),
			mapsUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "secondary",
				asChild: true,
				className: "mt-5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: mapsUrl,
					target: "_blank",
					rel: "noopener noreferrer",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigation, {}), "Directions"]
				})
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "shop-contact",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { size: 15 }), "Shop location not available for directions."]
			}),
			!searchResult && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "shop-list mt-5",
				"aria-label": "Products at this shop",
				children: page.products.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "shop-card",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: item.product.name }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.product.size || item.product.brand || "Reported availability" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "shop-meta",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Availability, { status: item.status })
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: rupees(item.price) })]
				}, item.product.id))
			}),
			referralProduct && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "local-note",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Info, { size: 26 }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Reported out at this shop" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Checking the service for another nearby shop reporting stock." })] })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "section-heading",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Nearby alternative" })
				}),
				referralLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					role: "status",
					children: "Looking for another shop…"
				}) : referralError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "empty-state",
					role: "alert",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: referralError })
				}) : referral ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "shop-list",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShopCard, { shop: referral })
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "map-note",
					children: "No nearby shop reported this product in stock."
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "trust-note",
				children: "Availability is reported by shops and can change before you arrive."
			})
		]
	});
}
//#endregion
export { ShopDetail as component };
