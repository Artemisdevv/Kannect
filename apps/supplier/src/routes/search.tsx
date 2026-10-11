import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Search, X, ArrowRight, Wheat, Milk, Carrot, Apple, Leaf, ShieldCheck, ScanBarcode, List, Map, MapPin, Loader2, SearchX, WifiOff, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useShopper } from '@/components/shopper-shell';
import { ShopCard } from '@/components/shop-result';
import groceries from '@/assets/neighbourhood-groceries.jpg';

export const Route = createFileRoute('/search')({
  head: () => ({ meta: [
    { title: 'Search everyday items — KadaNet' },
    { name: 'description', content: 'Search everyday essentials and discover reported availability at your neighbourhood shops. No account needed.' },
    { property: 'og:title', content: 'Search everyday items — KadaNet' },
    { property: 'og:description', content: 'Your neighbourhood, in stock. Find local shops with the everyday essentials you need.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: SearchPage,
});
const suggestions = [{ name: 'Rice & grains', sub: 'Everyday staples', query: 'rice', Icon: Wheat }, { name: 'Dairy', sub: 'Fresh essentials', query: 'milk', Icon: Milk }, { name: 'Vegetables', sub: 'Farm to kitchen', query: 'tomato', Icon: Carrot }, { name: 'Fruits', sub: 'A little freshness', query: 'banana', Icon: Apple }];
function SearchPage() {
  const { query, setQuery, resetSearch, response, loading, error, search, area, setLocationOpen, offline } = useShopper();
  const [view, setView] = useState<'list' | 'map'>('list');
  const showingResults = !!response || loading || !!error;
  return <main className="app-main">
    <div className="welcome"><p className="eyebrow">A little closer. A little easier.</p><h1>Your neighbourhood, <span>in stock.</span></h1></div>
    {!showingResults && <div className="intro-photo"><img src={groceries} alt="Fresh vegetables, fruit, milk and rice in a neighbourhood grocery bag" width={1536} height={768} fetchPriority="high" /><div className="intro-photo-copy"><h2>Everyday needs.<br />Nearby shops.</h2><p>Find what you need, right around the corner.</p></div></div>}
    <div className="search-block"><form onSubmit={e => { e.preventDefault(); void search(query); }}>
      <div className="search-field"><Search size={20} className="text-muted-foreground" /><Input id="product-search" aria-label="Search products" placeholder="Search rice, milk, vegetables…" value={query} onChange={e => setQuery(e.target.value)} />{query && <Button size="icon" variant="ghost" aria-label="Clear search" onClick={resetSearch}><X /></Button>}<Button type="submit" aria-label="Find nearby shops" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <ArrowRight />}<span className="search-submit">Search</span></Button></div>
    </form><div className="search-helper"><span><ScanBarcode size={13} />Product name or barcode</span><span className="example-label"><span className="h-1.5 w-1.5 rounded-full bg-warning" />Demo catalogue</span></div></div>
    {!showingResults ? <>
      <div className="section-heading"><h2>What’s on your list?</h2><span className="example-label">Example searches</span></div>
      <div className="example-grid">{suggestions.map(({ name, sub, query: q, Icon }) => <Button key={q} variant="ghost" className="example-tile" onClick={() => void search(q)}><Icon /><span>{name}</span><small>{sub}</small></Button>)}</div>
      <div className="chips">{['Rice', 'Flour', 'Oil', 'Spices', 'Lentils', 'Milk', 'Bread', 'Sugar', 'Tea'].map(q => <Button key={q} variant="outline" size="sm" onClick={() => void search(q)}>{q}<ArrowRight className="size-3" /></Button>)}</div>
      <div className="local-note"><Leaf size={31} strokeWidth={1.5} /><div><h3>Good for you. Good for your neighbourhood.</h3><p>A shorter trip. A familiar face. Find your essentials at the local shops that make your neighbourhood yours.</p></div></div>
    </> : <>
      {loading ? <div className="empty-state" role="status"><Loader2 className="animate-spin" /><h2>Checking nearby shops…</h2><p>Finding matches for “{query}”.</p></div> : error ? <div className="empty-state" role="alert">{offline ? <WifiOff /> : <SearchX />}<h2>Let’s try that again</h2><p>{error}</p><Button onClick={() => void search(query)}>Retry search</Button></div> : response && <>
        <div className="section-heading"><div className="min-w-0"><h2>{response.shops.length ? `${response.shops.length} shops with “${query}”` : 'Search results'}</h2><p>{area} · Reported availability</p></div><div className="view-toggle" role="group" aria-label="Result view"><Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List /></Button><Button variant={view === 'map' ? 'secondary' : 'ghost'} size="icon" aria-label="Map view" aria-pressed={view === 'map'} onClick={() => setView('map')}><Map /></Button></div></div>
        <div className="demo-banner"><Info size={14} />{response.cachedAt ? 'Saved demo results · Availability may be out of date.' : 'Example shops and prices — not live availability.'}</div>
        {view === 'map' && <div className="local-note mb-5 mt-0"><MapPin size={28} /><div><h3>Map isn’t available yet</h3><p>A map service hasn’t been connected. You can still find all matching shops in the list below.</p><Button variant="outline" className="mt-3" onClick={() => setView('list')}>Back to list</Button></div></div>}
        {response.shops.length ? <div className="shop-list" aria-label="Matching shops">{response.shops.map(shop => <ShopCard key={shop.id} shop={shop} />)}</div> : <div className="empty-state"><SearchX /><h2>{['Edappally', 'Kakkanad', 'Palarivattom', 'Your location'].includes(area) ? 'No matching products' : 'No shops in this area yet'}</h2><p>No example matches for “{query}” in {area}. Try rice, milk, eggs, or another area.</p><Button variant="secondary" onClick={() => setLocationOpen(true)}><MapPin />Change area</Button></div>}
      </>}
    </>}
    <p className="trust-note"><ShieldCheck size={14} className="shrink-0 mt-0.5" /><span>No account needed. Availability comes from shop updates<br className="hidden sm:block" /> and may change before you arrive.</span></p>
  </main>;
}