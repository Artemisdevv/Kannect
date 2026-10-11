import { n as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { D as ArrowRight, T as Carrot, b as Leaf, c as Search, g as MapPin, h as Map, k as Apple, l as SearchX, m as Milk, n as WifiOff, r as Wheat, s as ShieldCheck, t as X, u as ScanBarcode, v as LoaderCircle, y as List } from "../_libs/lucide-react.mjs";
import { c as useShopper, n as Input, t as Button } from "./shopper-shell-CSur-y61.mjs";
import { r as ShopCard } from "./shop-result-DTFHz4iV.mjs";
import { r as resultMapShops, t as ShopMap } from "./neighbourhood-groceries-DzRnydUC.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/search-BUvAaGWS.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var suggestions = [
	{
		name: "Rice & grains",
		sub: "Everyday staples",
		query: "rice",
		Icon: Wheat
	},
	{
		name: "Dairy",
		sub: "Fresh essentials",
		query: "milk",
		Icon: Milk
	},
	{
		name: "Vegetables",
		sub: "Farm to kitchen",
		query: "tomato",
		Icon: Carrot
	},
	{
		name: "Fruits",
		sub: "A little freshness",
		query: "banana",
		Icon: Apple
	}
];
function SearchPage() {
	const { query, setQuery, resetSearch, response, loading, error, search, area, setLocationOpen, offline, selectedShopId, selectShop } = useShopper();
	const [view, setView] = (0, import_react.useState)("list");
	const showingResults = !!response || loading || !!error;
	const mapShops = (0, import_react.useMemo)(() => resultMapShops(response?.shops ?? []), [response?.shops]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "app-main",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "welcome",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "eyebrow",
					children: "A little closer. A little easier."
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", { children: ["Your neighbourhood, ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "in stock." })] })]
			}),
			!showingResults && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "intro-photo",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: "/assets/neighbourhood-groceries-C-BPe3sI.jpg",
					alt: "Fresh vegetables, fruit, milk and rice in a neighbourhood grocery bag",
					width: 1536,
					height: 768,
					fetchPriority: "high"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "intro-photo-copy",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", { children: [
						"Everyday needs.",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
						"Nearby shops."
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Find what you need, right around the corner." })]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "search-block",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("form", {
					onSubmit: (e) => {
						e.preventDefault();
						search(query);
					},
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "search-field",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
								size: 20,
								className: "text-muted-foreground"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								id: "product-search",
								"aria-label": "Search products",
								placeholder: "Search rice, milk, vegetables…",
								value: query,
								onChange: (e) => setQuery(e.target.value)
							}),
							query && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								size: "icon",
								variant: "ghost",
								"aria-label": "Clear search",
								onClick: resetSearch,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								type: "submit",
								"aria-label": "Find nearby shops",
								disabled: loading,
								children: [loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "search-submit",
									children: "Search"
								})]
							})
						]
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "search-helper",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScanBarcode, { size: 13 }), "Product name or barcode"] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [area, " · Live shop results"] })]
				})]
			}),
			!showingResults ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "section-heading",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "What’s on your list?" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "example-label",
						children: "Suggested searches"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "example-grid",
					children: suggestions.map(({ name, sub, query: q, Icon }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "ghost",
						className: "example-tile",
						onClick: () => void search(q),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: name }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: sub })
						]
					}, q))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "chips",
					children: [
						"Rice",
						"Flour",
						"Oil",
						"Spices",
						"Lentils",
						"Milk",
						"Bread",
						"Sugar",
						"Tea"
					].map((q) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "outline",
						size: "sm",
						onClick: () => void search(q),
						children: [q, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, { className: "size-3" })]
					}, q))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "local-note",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Leaf, {
						size: 31,
						strokeWidth: 1.5
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Good for you. Good for your neighbourhood." }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "A shorter trip. A familiar face. Find your essentials at the local shops that make your neighbourhood yours." })] })]
				})
			] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "empty-state",
				role: "status",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "animate-spin" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Checking nearby shops…" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
						"Finding matches for “",
						query,
						"”."
					] })
				]
			}) : error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "empty-state",
				role: "alert",
				children: [
					offline ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WifiOff, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchX, {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Let’s try that again" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: error }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						onClick: () => void search(query),
						children: "Retry search"
					})
				]
			}) : response && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "section-heading",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: response.shops.length ? `${response.shops.length} matches for “${query}”` : "Search results" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [area, " · Reported availability"] })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "view-toggle",
						role: "group",
						"aria-label": "Result view",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: view === "list" ? "secondary" : "ghost",
							size: "icon",
							"aria-label": "List view",
							"aria-pressed": view === "list",
							onClick: () => setView("list"),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(List, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: view === "map" ? "secondary" : "ghost",
							size: "icon",
							"aria-label": "Map view",
							"aria-pressed": view === "map",
							onClick: () => setView("map"),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Map, {})
						})]
					})]
				}),
				view === "map" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShopMap, {
					shops: mapShops,
					selectedId: selectedShopId,
					onSelect: selectShop
				}),
				response.shops.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "shop-list",
					"aria-label": "Matching shops",
					children: response.shops.map((shop, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						onFocus: () => selectShop(shop.id),
						onMouseEnter: () => selectShop(shop.id),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShopCard, { shop })
					}, `${shop.id}:${shop.product.id}:${index}`))
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "empty-state",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SearchX, {}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "No matching products" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
							"No shops reported a match for “",
							query,
							"” in ",
							area,
							". Try another product or area."
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "secondary",
							onClick: () => setLocationOpen(true),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, {}), "Change area"]
						})
					]
				})
			] }) }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "trust-note",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, {
					size: 14,
					className: "shrink-0 mt-0.5"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "No account needed. Availability comes from shop updates and may change before you arrive." })]
			})
		]
	});
}
//#endregion
export { SearchPage as component };
