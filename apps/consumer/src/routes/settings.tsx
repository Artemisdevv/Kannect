import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Download, MapPin, ShieldCheck, ShoppingBag, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShopper } from '@/components/shopper-shell';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export const Route = createFileRoute('/settings')({ head: () => ({ meta: [
  { title: 'Privacy & settings — KadaNet' }, { name: 'description', content: 'Manage your neighbourhood and learn how KadaNet protects your privacy. Install KadaNet on your home screen.' },
  { property: 'og:title', content: 'Privacy & settings — KadaNet' }, { property: 'og:description', content: 'Your local shopping search, without an account or unnecessary personal information.' },
  { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
] }), component: Settings });
function Settings() {
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
  return <main className="app-main"><p className="eyebrow">Make yourself at home</p><h1 className="mt-2">Settings & privacy</h1>
    <section className="settings-section"><h2 className="flex items-center gap-2"><MapPin size={17} />Your neighbourhood</h2><p>Currently looking around {area}. Location is optional — choosing an area works too.</p><Button variant="secondary" onClick={() => setLocationOpen(true)}>Change area</Button></section>
    <section className="settings-section"><h2 className="flex items-center gap-2"><Download size={17} />KadaNet on your home screen</h2><p>Keep your neighbourhood shops just a tap away.</p><Button disabled={installed} onClick={async () => { if (prompt) { await prompt.prompt(); await prompt.userChoice; setPrompt(undefined); } else setGuidance(true); }}>{installed ? <Check /> : <Download />}{installed ? 'Already installed' : 'Add to home screen'}</Button>{guidance && <p className="mt-4" role="status">On Android, open the published app in Chrome and choose “Install app” or “Add to Home screen” from the browser menu. On iPhone, use Safari’s Share menu, then “Add to Home Screen”. Offline access is available only in the published app after an online visit.</p>}</section>
    <section className="settings-section"><h2 className="flex items-center gap-2"><ShieldCheck size={17} />Your privacy, by default</h2><p>No account, phone number, or email is needed. Your precise location is only used for nearby search and isn’t saved or shared. Public search results may be saved for this browser session, with a clear warning when they’re out of date.</p><Button variant="outline" onClick={() => { Object.keys(sessionStorage).filter(k => k.startsWith('kadanet:')).forEach(k => sessionStorage.removeItem(k)); setCleared(true); }}>{cleared ? <Check /> : null}{cleared ? 'Saved results cleared' : 'Clear saved results'}</Button></section>
    <section className="settings-section"><h2 className="flex items-center gap-2"><ShoppingBag size={17} />Made for the neighbourhood</h2><p>KadaNet helps you find everyday items at local shops. This preview uses a labelled demo catalogue. Shop names, prices, and availability are examples, not verified live information.</p><span className="example-label">KadaNet Consumer · 1.0</span></section>
  </main>;
}