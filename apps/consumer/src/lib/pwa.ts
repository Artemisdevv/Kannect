export async function registerAppWorker() {
  if (!('serviceWorker' in navigator)) return;
  // The Android app bundles its files, so it needs no service worker.
  if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) return;
  const host = window.location.hostname;
  const refused = !import.meta.env.PROD || window.self !== window.top ||
    host.startsWith('id-preview--') || host.startsWith('preview--') ||
    ['lovableproject.com', 'lovableproject-dev.com', 'beta.lovable.dev'].some(domain => host === domain || host.endsWith(`.${domain}`)) ||
    new URLSearchParams(window.location.search).get('sw') === 'off';
  if (refused) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(r => [r.active, r.waiting, r.installing].some(worker => worker && new URL(worker.scriptURL).pathname === '/sw.js')).map(r => r.unregister()));
    return;
  }
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}