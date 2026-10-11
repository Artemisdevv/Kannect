import { n as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { b as Link, p as useRouterState } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { C as ChevronDown, _ as LocateFixed, a as SlidersHorizontal, c as Search, g as MapPin, i as Store, n as WifiOff, o as ShoppingBag, t as X, v as LoaderCircle } from "../_libs/lucide-react.mjs";
import { a as DialogOverlay$1, i as DialogDescription$1, l as Slot, n as DialogClose, o as DialogPortal$1, r as DialogContent$1, s as DialogTitle$1, t as Dialog$1 } from "../_libs/@radix-ui/react-dialog+[...].mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/shopper-shell-CSur-y61.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var buttonVariants = cva("inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", {
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground hover:bg-primary-hover",
			botanical: "bg-accent text-accent-foreground hover:bg-accent/80",
			destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
			outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
			secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
			ghost: "hover:bg-accent hover:text-accent-foreground",
			link: "text-primary underline-offset-4 hover:underline"
		},
		size: {
			default: "min-h-12 px-5 py-2",
			sm: "min-h-12 px-4 text-xs",
			lg: "min-h-14 px-8",
			icon: "h-12 w-12"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
var Button = import_react.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size,
			className
		})),
		ref,
		...props
	});
});
Button.displayName = "Button";
var Input = import_react.forwardRef(({ className, type, ...props }, ref) => {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		type,
		className: cn("flex min-h-12 w-full min-w-0 rounded-full border border-input bg-background px-4 py-2 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className),
		ref,
		...props
	});
});
Input.displayName = "Input";
var Dialog = Dialog$1;
var DialogPortal = DialogPortal$1;
var DialogOverlay = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay$1, {
	ref,
	className: cn("fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className),
	...props
}));
DialogOverlay.displayName = DialogOverlay$1.displayName;
var DialogContent = import_react.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogPortal, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogOverlay, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent$1, {
	ref,
	className: cn("fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-28px)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border bg-elevated p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95", className),
	...props,
	children: [children, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogClose, {
		className: "absolute right-2 top-2 grid h-12 w-12 place-items-center rounded-full opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "h-4 w-4" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "sr-only",
			children: "Close"
		})]
	})]
})] }));
DialogContent.displayName = DialogContent$1.displayName;
var DialogHeader = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col space-y-1.5 text-center sm:text-left", className),
	...props
});
DialogHeader.displayName = "DialogHeader";
var DialogFooter = ({ className, ...props }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
	className: cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className),
	...props
});
DialogFooter.displayName = "DialogFooter";
var DialogTitle = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle$1, {
	ref,
	className: cn("text-lg font-semibold leading-none tracking-tight", className),
	...props
}));
DialogTitle.displayName = DialogTitle$1.displayName;
var DialogDescription = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription$1, {
	ref,
	className: cn("text-sm text-muted-foreground", className),
	...props
}));
DialogDescription.displayName = DialogDescription$1.displayName;
var areas = [
	"Edappally",
	"Kakkanad",
	"Palarivattom"
];
var apiBase = ({
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
}["VITE_API_URL"] || "http://localhost:8000/api/v1").replace(/\/+$/, "");
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function requiredString(value, field) {
	if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid API response: ${field} is missing.`);
	return value;
}
function nullableString(value, field) {
	if (value == null) return null;
	if (typeof value !== "string") throw new Error(`Invalid API response: ${field} must be text or null.`);
	return value;
}
function nullableNumber(value, field) {
	if (value == null) return null;
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid API response: ${field} must be a number or null.`);
	return value;
}
function parseLocation(value) {
	if (!isRecord(value)) return null;
	const lat = nullableNumber(value["lat"], "shop.location.lat");
	const lng = nullableNumber(value["lng"], "shop.location.lng");
	if (lat === null || lng === null || !validCoordinates({
		latitude: lat,
		longitude: lng
	})) return null;
	return {
		latitude: lat,
		longitude: lng
	};
}
function parseShop(value) {
	if (!isRecord(value)) throw new Error("Invalid API response: shop must be an object.");
	const distanceM = nullableNumber(value["distance_m"], "distance_m");
	if (distanceM !== null && distanceM < 0) throw new Error("Invalid API response: distance_m cannot be negative.");
	return {
		id: requiredString(value["id"], "shop.id"),
		name: requiredString(value["name"], "shop.name"),
		address: nullableString(value["address"], "shop.address"),
		phone: nullableString(value["phone"], "shop.phone"),
		coordinates: parseLocation(value["location"]),
		distanceM
	};
}
function parseProduct(value) {
	if (!isRecord(value)) throw new Error("Invalid API response: product must be an object.");
	return {
		id: requiredString(value["id"], "product.id"),
		name: requiredString(value["name"], "product.name"),
		nameMl: nullableString(value["name_ml"], "product.name_ml"),
		brand: nullableString(value["brand"], "product.brand"),
		size: nullableString(value["size"], "product.size"),
		unit: nullableString(value["unit"], "product.unit"),
		imageUrl: nullableString(value["image_url"], "product.image_url")
	};
}
function parseStatus(value) {
	if (value !== "in_stock" && value !== "low" && value !== "out") throw new Error("Invalid API response: unknown stock status.");
	return value;
}
function parseShopResult(value) {
	if (!isRecord(value)) throw new Error("Invalid API response: result must be an object.");
	return {
		...parseShop(value["shop"]),
		product: parseProduct(value["product"]),
		price: nullableNumber(value["price"], "price"),
		status: parseStatus(value["stock_status"])
	};
}
async function request(path, params, signal) {
	const url = new URL(`${apiBase}${path}`);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(/* @__PURE__ */ new Error("Request timed out. Please try again.")), 12e3);
	const abort = () => controller.abort(signal?.reason);
	signal?.addEventListener("abort", abort, { once: true });
	try {
		const response = await fetch(url, {
			headers: { Accept: "application/json" },
			signal: controller.signal
		});
		if (!response.ok) {
			let detail = `Request failed (${response.status}). Please try again.`;
			try {
				const body = await response.json();
				if (isRecord(body) && typeof body["detail"] === "string") detail = body["detail"];
			} catch {}
			throw new Error(detail);
		}
		try {
			return await response.json();
		} catch {
			throw new Error("The server returned invalid JSON. Please try again.");
		}
	} catch (error) {
		if (controller.signal.aborted && !signal?.aborted) throw new Error("Request timed out. Please try again.");
		if (error instanceof TypeError) throw new Error("Could not connect to the shop service. Check your connection and try again.");
		throw error;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
	}
}
function originParams(origin) {
	if (typeof origin === "string") return { area: origin };
	if (!validCoordinates(origin)) throw new Error("Your location is invalid. Choose an area and try again.");
	return {
		lat: String(origin.latitude),
		lng: String(origin.longitude)
	};
}
function validCoordinates(c) {
	return !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;
}
function distanceKm(distanceM) {
	return distanceM === null ? null : distanceM / 1e3;
}
async function searchProducts(query, origin, signal) {
	const body = await request("/search", {
		q: query.trim(),
		...originParams(origin),
		include_out: "true"
	}, signal);
	if (!isRecord(body) || !Array.isArray(body["results"])) throw new Error("Invalid API response: search results are missing.");
	return { shops: body["results"].map(parseShopResult) };
}
async function fetchNearbyShops(origin, signal) {
	const body = await request("/shops/nearby", originParams(origin), signal);
	if (!isRecord(body) || !Array.isArray(body["shops"])) throw new Error("Invalid API response: nearby shops are missing.");
	return body["shops"].map(parseShop);
}
async function fetchShopPage(id, query, signal) {
	const params = query?.trim() ? { q: query.trim() } : {};
	const body = await request(`/shops/${encodeURIComponent(id)}`, params, signal);
	if (!isRecord(body) || !Array.isArray(body["products"])) throw new Error("Invalid API response: shop products are missing.");
	const products = body["products"].map((item) => {
		if (!isRecord(item)) throw new Error("Invalid API response: shop product must be an object.");
		return {
			product: parseProduct(item["product"]),
			price: nullableNumber(item["price"], "price"),
			status: parseStatus(item["stock_status"])
		};
	});
	return {
		shop: parseShop(body["shop"]),
		products
	};
}
async function fetchReferral(shopId, productId, signal) {
	const body = await request("/search/referral", {
		shop_id: shopId,
		product_id: productId
	}, signal);
	if (!isRecord(body) || !("referral" in body)) throw new Error("Invalid API response: referral is missing.");
	return body["referral"] === null ? null : parseShopResult(body["referral"]);
}
var rupees = (value) => value === null ? "Price not listed" : new Intl.NumberFormat("en-IN", {
	style: "currency",
	currency: "INR",
	maximumFractionDigits: 0
}).format(value);
async function registerAppWorker() {
	if (!("serviceWorker" in navigator)) return;
	const host = window.location.hostname;
	if (window.self !== window.top || host.startsWith("id-preview--") || host.startsWith("preview--") || [
		"lovableproject.com",
		"lovableproject-dev.com",
		"beta.lovable.dev"
	].some((domain) => host === domain || host.endsWith(`.${domain}`)) || new URLSearchParams(window.location.search).get("sw") === "off") {
		const registrations = await navigator.serviceWorker.getRegistrations();
		await Promise.all(registrations.filter((r) => [
			r.active,
			r.waiting,
			r.installing
		].some((worker) => worker && new URL(worker.scriptURL).pathname === "/sw.js")).map((r) => r.unregister()));
		return;
	}
	const { registerSW } = await import("./virtual_pwa-register-f-k30srU.mjs");
	registerSW({ immediate: true });
}
var Context = (0, import_react.createContext)(null);
function useShopper() {
	const value = (0, import_react.useContext)(Context);
	if (!value) throw new Error("Shopper context is missing");
	return value;
}
function ShopperShell({ children }) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const [area, setArea] = (0, import_react.useState)("Edappally");
	const [query, updateQuery] = (0, import_react.useState)("");
	const requestId = (0, import_react.useRef)(0);
	const searchTimer = (0, import_react.useRef)(void 0);
	const [response, setResponse] = (0, import_react.useState)(null);
	const [coordinates, setCoordinates] = (0, import_react.useState)();
	const [nearby, setNearby] = (0, import_react.useState)([]);
	const [nearbyError, setNearbyError] = (0, import_react.useState)("");
	const [selectedShopId, setSelectedShopId] = (0, import_react.useState)();
	const [loading, setLoading] = (0, import_react.useState)(false);
	const [nearbyLoading, setNearbyLoading] = (0, import_react.useState)(true);
	const [error, setError] = (0, import_react.useState)("");
	const [offline, setOffline] = (0, import_react.useState)(false);
	const [locationOpen, setLocationOpen] = (0, import_react.useState)(false);
	const [locationMessage, setLocationMessage] = (0, import_react.useState)("");
	const [locating, setLocating] = (0, import_react.useState)(false);
	const [manualArea, setManualArea] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		const update = () => setOffline(!navigator.onLine);
		update();
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		registerAppWorker().catch(() => {});
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);
	async function search(q) {
		clearTimeout(searchTimer.current);
		const id = ++requestId.current;
		updateQuery(q);
		setError("");
		setResponse(null);
		if (!q.trim()) {
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			if (!navigator.onLine) throw new Error("You’re offline. Reconnect to search for current shop availability.");
			const result = await searchProducts(q, coordinates ?? area);
			if (id !== requestId.current) return;
			setResponse(result);
		} catch (e) {
			if (id === requestId.current) {
				setResponse(null);
				setError(e instanceof Error ? e.message : "Search couldn’t load. Please try again.");
			}
		} finally {
			if (id === requestId.current) setLoading(false);
		}
	}
	function resetSearch() {
		clearTimeout(searchTimer.current);
		++requestId.current;
		updateQuery("");
		setResponse(null);
		setLoading(false);
		setError("");
	}
	function setQuery(q) {
		resetSearch();
		updateQuery(q);
		if (!q.trim()) return;
		setLoading(true);
		searchTimer.current = setTimeout(() => {
			search(q);
		}, 250);
	}
	(0, import_react.useEffect)(() => () => {
		clearTimeout(searchTimer.current);
		++requestId.current;
	}, []);
	function chooseArea(value) {
		if (!value.trim()) return;
		resetSearch();
		setArea(value.trim());
		setCoordinates(void 0);
		setLocationOpen(false);
		setLocationMessage("");
	}
	(0, import_react.useEffect)(() => {
		const controller = new AbortController();
		setNearbyError("");
		setNearby([]);
		setNearbyLoading(true);
		fetchNearbyShops(coordinates ?? area, controller.signal).then(setNearby).catch((e) => {
			if (!controller.signal.aborted) setNearbyError(e instanceof Error ? e.message : "Nearby shops couldn’t load.");
		}).finally(() => {
			if (!controller.signal.aborted) setNearbyLoading(false);
		});
		return () => controller.abort();
	}, [area, coordinates]);
	function selectShop(id) {
		setSelectedShopId(id);
	}
	function locate() {
		setLocationMessage("");
		if (!navigator.geolocation) {
			setLocationMessage("Location isn’t available on this device. Choose an area below.");
			return;
		}
		setLocating(true);
		navigator.geolocation.getCurrentPosition((position) => {
			resetSearch();
			setCoordinates({
				latitude: position.coords.latitude,
				longitude: position.coords.longitude
			});
			setLocating(false);
			setArea("Your location");
			setResponse(null);
			setLocationOpen(false);
		}, (e) => {
			setLocating(false);
			setLocationMessage(e.code === 1 ? "Location permission was denied. You can still search by choosing an area." : "We couldn’t find your location. Choose an area or try again.");
		}, {
			enableHighAccuracy: false,
			timeout: 1e4,
			maximumAge: 6e4
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Context.Provider, {
		value: {
			area,
			query,
			setQuery,
			resetSearch,
			nearby,
			nearbyError,
			nearbyLoading,
			selectedShopId,
			selectShop,
			response,
			loading,
			error,
			offline,
			search,
			locationOpen,
			setLocationOpen,
			hasLocation: !!coordinates
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "app-shell",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "app-header",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/",
						className: "brand min-w-0",
						"aria-label": "KadaNet home",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "brand-mark",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingBag, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["KadaNet", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-accent-foreground",
							children: "."
						})] })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "ghost",
						className: "area-button px-2",
						onClick: () => setLocationOpen(true),
						"aria-label": "Choose your area",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { className: "text-accent-foreground" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Looking around" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
									className: "max-w-32 truncate",
									children: area
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "size-3" })
						]
					})]
				}),
				offline && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "offline-banner flex items-center gap-2",
					role: "status",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(WifiOff, { size: 15 }), "You’re offline. Reconnect to check live shop availability."]
				}),
				children,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
					className: "bottom-nav",
					"aria-label": "Main navigation",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: "/",
							className: "nav-item",
							activeOptions: { exact: true },
							activeProps: { className: "active" },
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Store, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Nearby shops" })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: "/search",
							className: "nav-item nav-search",
							activeOptions: { exact: true },
							activeProps: { className: "active" },
							onClick: () => {
								if (pathname === "/search") resetSearch();
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Search" })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: "/settings",
							className: "nav-item",
							activeOptions: { exact: true },
							activeProps: { className: "active" },
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlidersHorizontal, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Settings" })]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
					open: locationOpen,
					onOpenChange: setLocationOpen,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Your neighbourhood" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, { children: "Choose an area, or use your location to find shops nearby. Your your device sends your location for nearby search; this app does not save it." })] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "botanical",
							onClick: locate,
							disabled: locating,
							children: [locating ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LocateFixed, {}), locating ? "Finding your location…" : "Use my location"]
						}),
						locationMessage && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs leading-relaxed text-warning",
							role: "alert",
							children: locationMessage
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted-foreground",
							children: "Or choose an area in Kochi"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid gap-2",
							children: areas.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: a === area ? "secondary" : "outline",
								onClick: () => chooseArea(a),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, {}), a]
							}, a))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
							className: "flex gap-2",
							onSubmit: (e) => {
								e.preventDefault();
								chooseArea(manualArea);
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								"aria-label": "Another area",
								placeholder: "Enter another area",
								value: manualArea,
								onChange: (e) => setManualArea(e.target.value)
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "submit",
								disabled: !manualArea.trim(),
								children: "Choose"
							})]
						})
					] })
				})
			]
		})
	});
}
//#endregion
export { fetchReferral as a, useShopper as c, distanceKm as i, Input as n, fetchShopPage as o, ShopperShell as r, rupees as s, Button as t };
