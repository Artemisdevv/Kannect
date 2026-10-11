globalThis.__nitro_main__ = import.meta.url;
import { n as HTTPError, r as defineLazyEventHandler, t as H3Core } from "./_libs/h3+rou3+srvx+unenv.mjs";
import { t as HookableCore } from "./_libs/hookable.mjs";
import { r as FastResponse } from "./_libs/h3-v2+rou3+srvx.mjs";
//#region #nitro-vite-setup
function lazyService(loader) {
	let promise, mod;
	return { fetch(req) {
		if (mod) return mod.fetch(req);
		if (!promise) promise = loader().then((_mod) => mod = _mod.default || _mod);
		return promise.then((mod) => mod.fetch(req));
	} };
}
var services = { ["ssr"]: lazyService(() => import("./_ssr/ssr.mjs")) };
globalThis.__nitro_vite_envs__ = services;
//#endregion
//#region #nitro/virtual/public-assets-data
var public_assets_data_default = {
	"/favicon.ico": {
		"type": "image/vnd.microsoft.icon",
		"etag": "\"4f95-3RXc3p2mhEAs1WBwaIvE0Y0uu0Y\"",
		"mtime": "2026-10-11T14:39:17.768Z",
		"size": 20373,
		"path": "../public/favicon.ico"
	},
	"/assets/check-C2rdQxy9.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"71-olEVUPIURwbUdse40bthHS2qylw\"",
		"mtime": "2026-10-11T17:17:04.998Z",
		"size": 113,
		"path": "../public/assets/check-C2rdQxy9.js"
	},
	"/manifest.webmanifest": {
		"type": "application/manifest+json",
		"etag": "\"17f-2mJz/fZWGKv/AmkVJGO0lkn0ls4\"",
		"mtime": "2026-10-11T17:17:05.005Z",
		"size": 383,
		"path": "../public/manifest.webmanifest"
	},
	"/icon-192.png": {
		"type": "image/png",
		"etag": "\"4b8-Ou6b7KzgXhC/RlJhAuhCnPysCOM\"",
		"mtime": "2026-10-11T14:39:17.768Z",
		"size": 1208,
		"path": "../public/icon-192.png"
	},
	"/robots.txt": {
		"type": "text/plain; charset=utf-8",
		"etag": "\"a0-CKGXSIe7TSsqDTmGm/nY1t/o5d0\"",
		"mtime": "2026-10-11T14:39:17.769Z",
		"size": 160,
		"path": "../public/robots.txt"
	},
	"/assets/neighbourhood-groceries-C1CRDig8.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"ba9-+5SPhodDUqDhW0kWx9rxC5suM5c\"",
		"mtime": "2026-10-11T17:17:04.999Z",
		"size": 2985,
		"path": "../public/assets/neighbourhood-groceries-C1CRDig8.js"
	},
	"/icon-512.png": {
		"type": "image/png",
		"etag": "\"d49-A6miZgNFfVtNOjXN6CwzSH3BZmE\"",
		"mtime": "2026-10-11T14:39:17.769Z",
		"size": 3401,
		"path": "../public/icon-512.png"
	},
	"/assets/routes-Cm_vzjnD.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"a37-N++iix63n4Ej9tmccT9o0PEH9Vw\"",
		"mtime": "2026-10-11T17:17:05.000Z",
		"size": 2615,
		"path": "../public/assets/routes-Cm_vzjnD.js"
	},
	"/assets/rolldown-runtime-CbXtAM7H.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"24d-+aXgvbJ1Wwcp2A8AXKIBByksYC8\"",
		"mtime": "2026-10-11T17:17:05.000Z",
		"size": 589,
		"path": "../public/assets/rolldown-runtime-CbXtAM7H.js"
	},
	"/assets/settings-43-LKicE.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"d3d-hvT/RgiL3slmXbkwA0qVlcx3ZJk\"",
		"mtime": "2026-10-11T17:17:05.001Z",
		"size": 3389,
		"path": "../public/assets/settings-43-LKicE.js"
	},
	"/assets/search-B4uctwhv.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"226a-OlX1YBOtFhG3N4DNMyZiRCp2610\"",
		"mtime": "2026-10-11T17:17:05.000Z",
		"size": 8810,
		"path": "../public/assets/search-B4uctwhv.js"
	},
	"/assets/shield-check-DBcDZISE.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"135-8J3ttKlQPRtDxZsyjL8M9FRYKkY\"",
		"mtime": "2026-10-11T17:17:05.002Z",
		"size": 309,
		"path": "../public/assets/shield-check-DBcDZISE.js"
	},
	"/assets/shop-result-D_0bhA4I.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"86d-cf9CJOTyBQpvhnHZwfHi1eSrb48\"",
		"mtime": "2026-10-11T17:17:05.002Z",
		"size": 2157,
		"path": "../public/assets/shop-result-D_0bhA4I.js"
	},
	"/assets/shops._shopId-BR6YFvPK.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1519-hhkwn0dgO4VXz1pVy9k0qN/a9QQ\"",
		"mtime": "2026-10-11T17:17:05.002Z",
		"size": 5401,
		"path": "../public/assets/shops._shopId-BR6YFvPK.js"
	},
	"/assets/leaflet-src-C86SPtGS.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"24552-FuC0yigdXhhqePGwSrYTdNGHDmU\"",
		"mtime": "2026-10-11T17:17:04.998Z",
		"size": 148818,
		"path": "../public/assets/leaflet-src-C86SPtGS.js"
	},
	"/assets/neighbourhood-groceries-vh-t_kPv.css": {
		"type": "text/css; charset=utf-8",
		"etag": "\"3af7-hJRdDJQQrsTdSxJ69xb7a611WZ4\"",
		"mtime": "2026-10-11T17:17:05.004Z",
		"size": 15095,
		"path": "../public/assets/neighbourhood-groceries-vh-t_kPv.css"
	},
	"/assets/virtual_pwa-register-BBDJ0bRx.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"464-BYrqsOWf3rTTYSnWqTvwct2AoBY\"",
		"mtime": "2026-10-11T17:17:05.003Z",
		"size": 1124,
		"path": "../public/assets/virtual_pwa-register-BBDJ0bRx.js"
	},
	"/assets/workbox-window.prod.es5-Bd17z0YL.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"1615-CPDn06/EO3pj6KudXz5uMZ0FkhI\"",
		"mtime": "2026-10-11T17:17:05.003Z",
		"size": 5653,
		"path": "../public/assets/workbox-window.prod.es5-Bd17z0YL.js"
	},
	"/assets/neighbourhood-groceries-C-BPe3sI.jpg": {
		"type": "image/jpeg",
		"etag": "\"1bf7e-7i7yk/963iNMiCiU86AOUO2F+BE\"",
		"mtime": "2026-10-11T17:17:05.004Z",
		"size": 114558,
		"path": "../public/assets/neighbourhood-groceries-C-BPe3sI.jpg"
	},
	"/assets/styles-D9ayNmKf.css": {
		"type": "text/css; charset=utf-8",
		"etag": "\"12fe8-doZ+0Q5kxHAULUFQBnHvYqgho4g\"",
		"mtime": "2026-10-11T17:17:05.005Z",
		"size": 77800,
		"path": "../public/assets/styles-D9ayNmKf.css"
	},
	"/assets/index-DF842iq2.js": {
		"type": "text/javascript; charset=utf-8",
		"etag": "\"67ac7-T6iOVDkNrWbqs9W39w9bf54NKZA\"",
		"mtime": "2026-10-11T17:17:04.997Z",
		"size": 424647,
		"path": "../public/assets/index-DF842iq2.js"
	}
};
//#endregion
//#region #nitro/virtual/public-assets
var publicAssetBases = {};
function isPublicAssetURL(id = "") {
	if (public_assets_data_default[id]) return true;
	for (const base in publicAssetBases) if (id.startsWith(base)) return true;
	return false;
}
//#endregion
//#region node_modules/nitro/dist/runtime/internal/route-rules.mjs
var headers = ((m) => function headersRouteRule(event) {
	for (const [key, value] of Object.entries(m.options || {})) event.res.headers.set(key, value);
});
//#endregion
//#region #nitro/virtual/routing
var findRouteRules = /* @__PURE__ */ (() => {
	const $0 = [{
		name: "headers",
		route: "/assets/**",
		handler: headers,
		options: { "cache-control": "public, max-age=31536000, immutable" }
	}];
	return (m, p) => {
		let r = [];
		if (p.charCodeAt(p.length - 1) === 47) p = p.slice(0, -1) || "/";
		let s = p.split("/");
		if (s.length > 1) {
			if (s[1] === "assets") r.unshift({
				data: $0,
				params: { "_": s.slice(2).join("/") }
			});
		}
		return r;
	};
})();
var _lazy_FaDP91 = defineLazyEventHandler(() => import("./_chunks/ssr-renderer.mjs"));
var findRoute = /* @__PURE__ */ (() => {
	const data = {
		route: "/**",
		handler: _lazy_FaDP91
	};
	return ((_m, p) => {
		return {
			data,
			params: { "_": p.slice(1) }
		};
	});
})();
[].filter(Boolean);
//#endregion
//#region node_modules/nitro/dist/runtime/internal/error/prod.mjs
var errorHandler = (error, event) => {
	const res = defaultHandler(error, event);
	return new FastResponse(typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2), res);
};
function defaultHandler(error, event) {
	const unhandled = error.unhandled ?? !HTTPError.isError(error);
	const { status = 500, statusText = "" } = unhandled ? {} : error;
	if (status === 404) {
		const url = event.url || new URL(event.req.url);
		const baseURL = "/";
		if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) return {
			status: 302,
			headers: new Headers({ location: `${baseURL}${url.pathname.slice(1)}${url.search}` })
		};
	}
	const headers = new Headers(unhandled ? {} : error.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	return {
		status,
		statusText,
		headers,
		body: {
			error: true,
			...unhandled ? {
				status,
				unhandled: true
			} : typeof error.toJSON === "function" ? error.toJSON() : {
				status,
				statusText,
				message: error.message
			}
		}
	};
}
//#endregion
//#region #nitro/virtual/error-handler
var errorHandlers = [errorHandler];
async function error_handler_default(error, event) {
	for (const handler of errorHandlers) try {
		const response = await handler(error, event, { defaultHandler });
		if (response) return response;
	} catch (error) {
		console.error(error);
	}
}
//#endregion
//#region #nitro/virtual/app
function createNitroApp() {
	const captureError = (error, errorCtx) => {
		if (errorCtx?.event) {
			const errors = errorCtx.event.req.context?.nitro?.errors;
			if (errors) errors.push({
				error,
				context: errorCtx
			});
		}
	};
	const h3App = createH3App({ onError(error, event) {
		return error_handler_default(error, event);
	} });
	let appHandler = (req) => {
		req.context ||= {};
		req.context.nitro = req.context.nitro || { errors: [] };
		return h3App.fetch(req);
	};
	return {
		fetch: appHandler,
		h3: h3App,
		hooks: void 0,
		captureError
	};
}
function createH3App(config) {
	const h3App = new H3Core(config);
	h3App["~findRoute"] = (event) => findRoute(event.req.method, event.url.pathname);
	h3App["~getMiddleware"] = (event, route) => {
		const pathname = event.url.pathname;
		const method = event.req.method;
		const middleware = [];
		const routeRules = getRouteRules(method, pathname);
		event.context.routeRules = routeRules?.routeRules;
		if (routeRules?.routeRuleMiddleware.length) middleware.push(...routeRules.routeRuleMiddleware);
		if (route?.data?.middleware?.length) middleware.push(...route.data.middleware);
		return middleware;
	};
	return h3App;
}
//#endregion
//#region node_modules/nitro/dist/runtime/internal/app.mjs
var APP_ID = "default";
function useNitroApp() {
	let instance = useNitroApp._instance;
	if (instance) return instance;
	instance = useNitroApp._instance = createNitroApp();
	globalThis.__nitro__ = globalThis.__nitro__ || {};
	globalThis.__nitro__[APP_ID] = instance;
	return instance;
}
function useNitroHooks() {
	const nitroApp = useNitroApp();
	const hooks = nitroApp.hooks;
	if (hooks) return hooks;
	return nitroApp.hooks = new HookableCore();
}
function getRouteRules(method, pathname) {
	const m = findRouteRules(method, pathname);
	if (!m?.length) return { routeRuleMiddleware: [] };
	const routeRules = {};
	for (const layer of m) for (const rule of layer.data) {
		const currentRule = routeRules[rule.name];
		if (currentRule) {
			if (rule.options === false) {
				delete routeRules[rule.name];
				continue;
			}
			if (typeof currentRule.options === "object" && typeof rule.options === "object") currentRule.options = {
				...currentRule.options,
				...rule.options
			};
			else currentRule.options = rule.options;
			currentRule.route = rule.route;
			currentRule.params = {
				...currentRule.params,
				...layer.params
			};
		} else if (rule.options !== false) routeRules[rule.name] = {
			...rule,
			params: layer.params
		};
	}
	const middleware = [];
	const orderedRules = Object.values(routeRules).sort((a, b) => (a.handler?.order || 0) - (b.handler?.order || 0));
	for (const rule of orderedRules) {
		if (rule.options === false || !rule.handler) continue;
		middleware.push(rule.handler(rule));
	}
	return {
		routeRules,
		routeRuleMiddleware: middleware
	};
}
//#endregion
//#region node_modules/nitro/dist/presets/cloudflare/runtime/_module-handler.mjs
function createHandler(hooks) {
	const nitroApp = useNitroApp();
	const nitroHooks = useNitroHooks();
	return {
		async fetch(request, env, context) {
			globalThis.__env__ = env;
			augmentReq(request, {
				env,
				context
			});
			const ctxExt = {};
			const url = new URL(request.url);
			if (hooks.fetch) {
				const res = await hooks.fetch(request, env, context, url, ctxExt);
				if (res) return res;
			}
			return await nitroApp.fetch(request);
		},
		scheduled(controller, env, context) {
			globalThis.__env__ = env;
			context.waitUntil(nitroHooks.callHook("cloudflare:scheduled", {
				controller,
				env,
				context
			}) || Promise.resolve());
		},
		email(message, env, context) {
			globalThis.__env__ = env;
			context.waitUntil(nitroHooks.callHook("cloudflare:email", {
				message,
				event: message,
				env,
				context
			}) || Promise.resolve());
		},
		queue(batch, env, context) {
			globalThis.__env__ = env;
			context.waitUntil(nitroHooks.callHook("cloudflare:queue", {
				batch,
				event: batch,
				env,
				context
			}) || Promise.resolve());
		},
		tail(traces, env, context) {
			globalThis.__env__ = env;
			context.waitUntil(nitroHooks.callHook("cloudflare:tail", {
				traces,
				env,
				context
			}) || Promise.resolve());
		},
		trace(traces, env, context) {
			globalThis.__env__ = env;
			context.waitUntil(nitroHooks.callHook("cloudflare:trace", {
				traces,
				env,
				context
			}) || Promise.resolve());
		}
	};
}
function augmentReq(cfReq, ctx) {
	const req = cfReq;
	req.ip = cfReq.headers.get("cf-connecting-ip") || void 0;
	req.runtime ??= { name: "cloudflare" };
	req.runtime.cloudflare = {
		...req.runtime.cloudflare,
		...ctx
	};
	req.waitUntil = ctx.context?.waitUntil.bind(ctx.context);
}
//#endregion
//#region node_modules/nitro/dist/presets/cloudflare/runtime/cloudflare-module.mjs
var cloudflare_module_default = createHandler({ fetch(cfRequest, env, context, url) {
	if (env.ASSETS && isPublicAssetURL(url.pathname)) return env.ASSETS.fetch(cfRequest);
} });
//#endregion
export { cloudflare_module_default as default };
