import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { ShoppingBag, MapPin, ChevronDown, Search, Store, SlidersHorizontal, LocateFixed, WifiOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { areas, nearbyShops, searchProducts, type Coordinates, type SearchResponse, type ShopResult } from '@/lib/shopper';
import { registerAppWorker } from '@/lib/pwa';

type ShopperContext = {
  area: string; query: string; setQuery: (q: string) => void;
  response: SearchResponse | null; loading: boolean; error: string; offline: boolean;
  search: (q: string) => Promise<void>; locationOpen: boolean; setLocationOpen: (v: boolean) => void;
  hasLocation: boolean;
  resetSearch: () => void; nearby: ShopResult[];
};
const Context = createContext<ShopperContext | null>(null);
export function useShopper() {
  const value = useContext(Context);
  if (!value) throw new Error('Shopper context is missing');
  return value;
}
export function ShopperShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const [area, setArea] = useState('Edappally');
  const [query, updateQuery] = useState('');
  const requestId = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [locating, setLocating] = useState(false);
  const [manualArea, setManualArea] = useState('');
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    registerAppWorker().catch(() => {});
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  async function search(q: string) {
    clearTimeout(searchTimer.current);
    const id = ++requestId.current;
    updateQuery(q); setError(''); setResponse(null);
    if (!q.trim()) { setLoading(false); return; }
    setLoading(true);
    try {
      // Cache only public results. Shopper coordinates are never persisted.
      const cacheKey = `kadanet:${area}:${q.trim().toLowerCase()}`;
      if (!navigator.onLine) {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) { setResponse(JSON.parse(raw)); return; }
        throw new Error('You’re offline. No saved results for this search. Reconnect and try again.');
      }
      const result = await searchProducts(q, area, coordinates);
      if (id !== requestId.current) return;
      setResponse(result);
      const cached = { ...result, shops: result.shops.map(({ distanceKm: _distance, ...shop }) => shop), cachedAt: Date.now() };
      sessionStorage.setItem(cacheKey, JSON.stringify(cached));
    } catch (e) { if (id === requestId.current) { setResponse(null); setError(e instanceof Error ? e.message : 'Search couldn’t load. Please try again.'); } }
    finally { if (id === requestId.current) setLoading(false); }
  }
  function resetSearch() {
    clearTimeout(searchTimer.current); ++requestId.current;
    updateQuery(''); setResponse(null); setLoading(false); setError('');
  }
  function setQuery(q: string) {
    resetSearch(); updateQuery(q);
    if (!q.trim()) return;
    setLoading(true);
    searchTimer.current = setTimeout(() => { void search(q); }, 250);
  }
  useEffect(() => () => { clearTimeout(searchTimer.current); ++requestId.current; }, []);
  function chooseArea(value: string) {
    if (!value.trim()) return;
    resetSearch(); setArea(value.trim()); setCoordinates(undefined); setLocationOpen(false); setLocationMessage('');
  }
  function locate() {
    setLocationMessage('');
    if (!navigator.geolocation) { setLocationMessage('Location isn’t available on this device. Choose an area below.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      resetSearch(); setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setLocating(false); setArea('Your location'); setResponse(null); setLocationOpen(false);
    }, e => { setLocating(false); setLocationMessage(e.code === 1 ? 'Location permission was denied. You can still search by choosing an area.' : 'We couldn’t find your location. Choose an area or try again.'); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }
  return <Context.Provider value={{ area, query, setQuery, resetSearch, nearby: nearbyShops(area, coordinates), response, loading, error, offline, search, locationOpen, setLocationOpen, hasLocation: !!coordinates }}>
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand min-w-0" aria-label="KadaNet home"><span className="brand-mark"><ShoppingBag /></span><span>KadaNet<span className="text-accent-foreground">.</span></span></Link>
        <Button variant="ghost" className="area-button px-2" onClick={() => setLocationOpen(true)} aria-label="Choose your area"><MapPin className="text-accent-foreground" /><span className="min-w-0"><small>Looking around</small><strong className="max-w-32 truncate">{area}</strong></span><ChevronDown className="size-3" /></Button>
      </header>
      {offline && <div className="offline-banner flex items-center gap-2" role="status"><WifiOff size={15} />You’re offline. Saved results may be out of date.</div>}
      {children}
      <nav className="bottom-nav" aria-label="Main navigation">
        <Link to="/" className="nav-item" activeOptions={{ exact: true }} activeProps={{ className: 'active' }}><Store /><span>Nearby shops</span></Link>
        <Link to="/search" className="nav-item nav-search" activeOptions={{ exact: true }} activeProps={{ className: 'active' }} onClick={() => { if (pathname === '/search') resetSearch(); }}><Search /><span>Search</span></Link>
        <Link to="/settings" className="nav-item" activeOptions={{ exact: true }} activeProps={{ className: 'active' }}><SlidersHorizontal /><span>Settings</span></Link>
      </nav>
      <Dialog open={locationOpen} onOpenChange={setLocationOpen}><DialogContent><DialogHeader><DialogTitle>Your neighbourhood</DialogTitle><DialogDescription>Choose an area, or use your location to find shops nearby. Your precise location is not saved or shared.</DialogDescription></DialogHeader>
        <Button variant="botanical" onClick={locate} disabled={locating}>{locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}{locating ? 'Finding your location…' : 'Use my location'}</Button>
        {locationMessage && <p className="text-xs leading-relaxed text-warning" role="alert">{locationMessage}</p>}
        <p className="text-xs text-muted-foreground">Or choose an area in Kochi</p>
        <div className="grid gap-2">{areas.map(a => <Button key={a} variant={a === area ? 'secondary' : 'outline'} onClick={() => chooseArea(a)}><MapPin />{a}</Button>)}</div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); chooseArea(manualArea); }}><Input aria-label="Another area" placeholder="Enter another area" value={manualArea} onChange={e => setManualArea(e.target.value)} /><Button type="submit" disabled={!manualArea.trim()}>Choose</Button></form>
      </DialogContent></Dialog>
    </div>
  </Context.Provider>;
}