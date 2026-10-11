import { n as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { S as Download, g as MapPin, o as ShoppingBag, s as ShieldCheck, w as Check } from "../_libs/lucide-react.mjs";
import { c as useShopper, t as Button } from "./shopper-shell-CSur-y61.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/settings-NG1WNB5m.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Settings() {
	const { area, setLocationOpen } = useShopper();
	const [prompt, setPrompt] = (0, import_react.useState)();
	const [installed, setInstalled] = (0, import_react.useState)(false);
	const [guidance, setGuidance] = (0, import_react.useState)(false);
	const [cleared, setCleared] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setInstalled(window.matchMedia("(display-mode: standalone)").matches);
		const listener = (e) => {
			e.preventDefault();
			setPrompt(e);
		};
		const onInstall = () => {
			setInstalled(true);
			setPrompt(void 0);
		};
		window.addEventListener("beforeinstallprompt", listener);
		window.addEventListener("appinstalled", onInstall);
		return () => {
			window.removeEventListener("beforeinstallprompt", listener);
			window.removeEventListener("appinstalled", onInstall);
		};
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "app-main",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "eyebrow",
				children: "Make yourself at home"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "mt-2",
				children: "Settings & privacy"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "settings-section",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MapPin, { size: 17 }), "Your neighbourhood"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
						"Currently looking around ",
						area,
						". Location is optional — choosing an area works too."
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						onClick: () => setLocationOpen(true),
						children: "Change area"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "settings-section",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { size: 17 }), "KadaNet on your home screen"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Keep your neighbourhood shops just a tap away." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						disabled: installed,
						onClick: async () => {
							if (prompt) {
								await prompt.prompt();
								await prompt.userChoice;
								setPrompt(void 0);
							} else setGuidance(true);
						},
						children: [installed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, {}), installed ? "Already installed" : "Add to home screen"]
					}),
					guidance && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4",
						role: "status",
						children: "On Android, open the published app in Chrome and choose “Install app” or “Add to Home screen” from the browser menu. On iPhone, use Safari’s Share menu, then “Add to Home Screen”. Offline access is available only in the published app after an online visit."
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "settings-section",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldCheck, { size: 17 }), "Your privacy, by default"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "No account, phone number, or email is needed. When you use location, your coordinates are sent to find nearby shops and kept only in memory by this app. Search results are not saved offline." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						variant: "outline",
						onClick: () => {
							Object.keys(sessionStorage).filter((k) => k.startsWith("kadanet:")).forEach((k) => sessionStorage.removeItem(k));
							setCleared(true);
						},
						children: [cleared ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {}) : null, cleared ? "Previously saved results cleared" : "Clear previously saved results"]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "settings-section",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShoppingBag, { size: 17 }), "Made for the neighbourhood"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "KadaNet helps you find everyday items at local shops. This preview uses a labelled demo catalogue. Shop names, prices, and availability are examples, not verified live information." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "example-label",
						children: "KadaNet Consumer · 1.0"
					})
				]
			})
		]
	});
}
//#endregion
export { Settings as component };
