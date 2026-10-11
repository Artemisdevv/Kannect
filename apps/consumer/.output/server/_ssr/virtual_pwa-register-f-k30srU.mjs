//#region node_modules/.nitro/vite/services/ssr/assets/virtual_pwa-register-f-k30srU.js
var autoUpdateMode = "true";
var selfDestroying = "false";
var auto = autoUpdateMode === "true";
var autoDestroy = selfDestroying === "true";
function registerSW(options = {}) {
	const { immediate = false, onNeedReload, onNeedRefresh, onOfflineReady, onRegistered, onRegisteredSW, onRegisterError } = options;
	let wb;
	let registerPromise;
	let sendSkipWaitingMessage;
	const updateServiceWorker = async (_reloadPage = true) => {
		await registerPromise;
		if (!auto) sendSkipWaitingMessage?.();
	};
	async function register() {
		if ("serviceWorker" in navigator) {
			wb = await import("./workbox-window.prod.es5-CkHxznpn.mjs").then(({ Workbox }) => {
				return new Workbox("/sw.js", {
					scope: "/",
					type: "classic"
				});
			}).catch((e) => {
				onRegisterError?.(e);
			});
			if (!wb) return;
			sendSkipWaitingMessage = () => {
				wb?.messageSkipWaiting();
			};
			if (!autoDestroy) if (auto) {
				wb.addEventListener("activated", (event) => {
					if (event.isUpdate || event.isExternal) if (onNeedReload) onNeedReload();
					else window.location.reload();
				});
				wb.addEventListener("installed", (event) => {
					if (!event.isUpdate) onOfflineReady?.();
				});
			} else {
				let onNeedRefreshCalled = false;
				const showSkipWaitingPrompt = () => {
					onNeedRefreshCalled = true;
					wb?.addEventListener("controlling", (event) => {
						if (event.isUpdate) if (onNeedReload) onNeedReload();
						else window.location.reload();
					});
					onNeedRefresh?.();
				};
				wb.addEventListener("installed", (event) => {
					if (typeof event.isUpdate === "undefined") if (typeof event.isExternal !== "undefined") if (event.isExternal) showSkipWaitingPrompt();
					else !onNeedRefreshCalled && onOfflineReady?.();
					else !onNeedRefreshCalled && onOfflineReady?.();
					else if (!event.isUpdate) onOfflineReady?.();
				});
				wb.addEventListener("waiting", showSkipWaitingPrompt);
			}
			wb.register({ immediate }).then((r) => {
				if (onRegisteredSW) onRegisteredSW("/sw.js", r);
				else onRegistered?.(r);
			}).catch((e) => {
				onRegisterError?.(e);
			});
		}
	}
	registerPromise = register();
	return updateServiceWorker;
}
//#endregion
export { registerSW };
