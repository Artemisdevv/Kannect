import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Download, MapPin, ShieldCheck, ShoppingBag, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShopper } from '@/components/shopper-shell';
import { isNativeApp } from '@/lib/native';
import { LanguageSelector, t, useLocale } from '@/lib/i18n';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export const Route = createFileRoute('/settings')({ head: () => ({ meta: [
  { title: 'Privacy & settings — Kannect' }, { name: 'description', content: 'Manage your neighbourhood and learn how Kannect protects your privacy. Install Kannect on your home screen.' },
  { property: 'og:title', content: 'Privacy & settings — Kannect' }, { property: 'og:description', content: 'Your local shopping search, without an account or unnecessary personal information.' },
  { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
] }), component: Settings });
function Settings() {
  const locale = useLocale();
  const { area, setLocationOpen } = useShopper();
  const [prompt, setPrompt] = useState<InstallPrompt>();
  const [installed, setInstalled] = useState(false);
  const [guidance, setGuidance] = useState(false);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    const listener = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    const onInstall = () => { setInstalled(true); setPrompt(undefined); };
    window.addEventListener('beforeinstallprompt', listener); window.addEventListener('appinstalled', onInstall);
    return () => { window.removeEventListener('beforeinstallprompt', listener); window.removeEventListener('appinstalled', onInstall); };
  }, []);
  return <main className="app-main"><p className="eyebrow">{t('Make yourself at home', locale)}</p><h1 className="mt-2">{t('Settings & privacy', locale)}</h1>
    <section className="settings-section"><LanguageSelector /></section>
    <section className="settings-section"><h2 className="flex items-center gap-2"><MapPin size={17} />{t('Your neighbourhood', locale)}</h2><p>{t('Currently looking around ', locale)}{area}{t('. Location is optional — choosing an area works too.', locale)}</p><Button variant="secondary" onClick={() => setLocationOpen(true)}>{t('Change area', locale)}</Button></section>
    {/* the Android app is already installed: only a browser visit can add a shortcut */}
    {!isNativeApp() && <section className="settings-section"><h2 className="flex items-center gap-2"><Download size={17} />{t('Kannect on your home screen', locale)}</h2><p>{t('Keep your neighbourhood shops just a tap away.', locale)}</p><Button disabled={installed} onClick={async () => { if (prompt) { await prompt.prompt(); await prompt.userChoice; setPrompt(undefined); } else setGuidance(true); }}>{installed ? <Check /> : <Download />}{installed ? t('Already installed', locale) : t('Add to home screen', locale)}</Button>{guidance && <p className="mt-4" role="status">{t('On Android, open the published app in Chrome and choose “Install app” or “Add to Home screen” from the browser menu. On iPhone, use Safari’s Share menu, then “Add to Home Screen”. Offline access is available only in the published app after an online visit.', locale)}</p>}</section>}
    <section className="settings-section"><h2 className="flex items-center gap-2"><ShieldCheck size={17} />{t('Your privacy, by default', locale)}</h2><p>{t('No account, phone number, or email is needed. Coordinates are sent for the current nearby request and are never saved by this app. Area-based public results may be saved for this browser session; precise-location searches are not cached.', locale)}</p><Button variant="outline" onClick={() => { Object.keys(sessionStorage).filter(k => k.startsWith('kannect:') || k.startsWith('kannect-live:')).forEach(k => sessionStorage.removeItem(k)); setCleared(true); }}>{cleared ? <Check /> : null}{cleared ? t('Saved results cleared', locale) : t('Clear saved results', locale)}</Button></section>
    <section className="settings-section"><h2 className="flex items-center gap-2"><ShoppingBag size={17} />{t('Made for the neighbourhood', locale)}</h2><p>{t('Kannect searches live public shop details and reported availability. Information can change before you arrive. If the API or network is unavailable, the app shows an error instead of sample shop results.', locale)}</p><span className="example-label">Kannect Consumer · 1.0</span></section>
  </main>;
}
