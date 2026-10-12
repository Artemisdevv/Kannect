import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Search, X, ArrowRight, Wheat, Milk, Carrot, Apple, Leaf, ShieldCheck, ScanBarcode, List, Map, MapPin, Loader2, SearchX, WifiOff, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useShopper } from '@/components/shopper-shell';
import { ShopCard } from '@/components/shop-result';
import { ShopMap } from '@/components/shop-map';
import { isKnownArea, resultMapShops } from '@/lib/shopper';
import groceries from '@/assets/neighbourhood-groceries.jpg';
import { t, useLocale } from '@/lib/i18n';

export const Route = createFileRoute('/search')({
  head: () => ({ meta: [
    { title: 'Search everyday items — Kannect' },
    { name: 'description', content: 'Search everyday essentials and discover reported availability at your neighbourhood shops. No account needed.' },
    { property: 'og:title', content: 'Search everyday items — Kannect' },
    { property: 'og:description', content: 'Your neighbourhood, in stock. Find local shops with the everyday essentials you need.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: SearchPage,
});
const suggestions = [{ name: 'Rice & grains', sub: 'Everyday staples', query: 'rice', Icon: Wheat }, { name: 'Dairy', sub: 'Fresh essentials', query: 'milk', Icon: Milk }, { name: 'Vegetables', sub: 'Farm to kitchen', query: 'tomato', Icon: Carrot }, { name: 'Fruits', sub: 'A little freshness', query: 'banana', Icon: Apple }];
function SearchPage() {
  const locale = useLocale();
  const { query, setQuery, resetSearch, response, loading, error, search, area, setLocationOpen, offline } = useShopper();
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selectedShopId, setSelectedShopId] = useState<string>();
  const showingResults = !!response || loading || !!error;
  return <main className="app-main">
    <div className="welcome"><p className="eyebrow">{t('A little closer. A little easier.', locale)}</p><h1>{t('Your neighbourhood, ', locale)}<span>{t('in stock.', locale)}</span></h1></div>
    {!showingResults && <div className="intro-photo"><img src={groceries} alt={t('Fresh vegetables, fruit, milk and rice in a neighbourhood grocery bag', locale)} width={1536} height={768} fetchPriority="high" /><div className="intro-photo-copy"><h2>{t('Everyday needs.', locale)}<br />{t('Nearby shops.', locale)}</h2><p>{t('Find what you need, right around the corner.', locale)}</p></div></div>}
    <div className="search-block"><form onSubmit={e => { e.preventDefault(); void search(query); }}>
      <div className="search-field"><Search size={20} className="text-muted-foreground" /><Input id="product-search" aria-label={t('Search products', locale)} placeholder={t('Search rice, milk, vegetables…', locale)} value={query} onChange={e => setQuery(e.target.value)} />{query && <Button size="icon" variant="ghost" aria-label={t('Clear search', locale)} onClick={resetSearch}><X /></Button>}<Button type="submit" aria-label={t('Find nearby shops', locale)} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <ArrowRight />}<span className="search-submit">{t('Search', locale)}</span></Button></div>
    </form><div className="search-helper"><span><ScanBarcode size={13} />{t('Product name or barcode', locale)}</span></div></div>
    {!showingResults ? <>
      <div className="section-heading"><h2>{t('What’s on your list?', locale)}</h2><span className="example-label">{t('Try one', locale)}</span></div>
      <div className="example-grid">{suggestions.map(({ name, sub, query: q, Icon }) => <Button key={q} variant="ghost" className="example-tile" onClick={() => void search(q)}><Icon /><span>{t(name, locale)}</span><small>{t(sub, locale)}</small></Button>)}</div>
      <div className="chips">{['Rice', 'Flour', 'Oil', 'Spices', 'Lentils', 'Milk', 'Bread', 'Sugar', 'Tea'].map(q => <Button key={q} variant="outline" size="sm" onClick={() => void search(q)}>{q}<ArrowRight className="size-3" /></Button>)}</div>
      <div className="local-note"><Leaf size={31} strokeWidth={1.5} /><div><h3>{t('Good for you. Good for your neighbourhood.', locale)}</h3><p>{t('A shorter trip. A familiar face. Find your essentials at the local shops that make your neighbourhood yours.', locale)}</p></div></div>
    </> : <>
      {loading ? <div className="empty-state" role="status"><Loader2 className="animate-spin" /><h2>{t('Checking nearby shops…', locale)}</h2><p>{t('Finding matches for ', locale)}“{query}”.</p></div> : error ? <div className="empty-state" role="alert">{offline ? <WifiOff /> : <SearchX />}<h2>{t('Let’s try that again', locale)}</h2><p>{t(error, locale)}</p><Button onClick={() => void search(query)}>{t('Retry search', locale)}</Button></div> : response && <>
        <div className="section-heading"><div className="min-w-0"><h2>{response.shops.length ? `${response.shops.length} ${t('shops with', locale)} “${query}”` : t('Search results', locale)}</h2><p>{area} · {t('Reported availability', locale)}</p></div><div className="view-toggle" role="group" aria-label={t('Result view', locale)}><Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" aria-label={t('List view', locale)} aria-pressed={view === 'list'} onClick={() => setView('list')}><List /></Button><Button variant={view === 'map' ? 'secondary' : 'ghost'} size="icon" aria-label={t('Map view', locale)} aria-pressed={view === 'map'} onClick={() => setView('map')}><Map /></Button></div></div>
        {response.cachedAt && <div className="demo-banner"><Info size={14} />{t('Saved results · Availability may be out of date.', locale)}</div>}
        {view === 'map' && <ShopMap shops={resultMapShops(response.shops)} selectedId={selectedShopId} onSelect={setSelectedShopId} />}
        {response.shops.length ? <div className="shop-list" aria-label={t('Matching shops', locale)}>{response.shops.map(shop => <ShopCard key={shop.uid} shop={shop} selected={selectedShopId === shop.id} onSelect={() => setSelectedShopId(shop.id)} />)}</div> : <div className="empty-state"><SearchX /><h2>{t(isKnownArea(area) ? 'No matching products' : 'No shops in this area yet', locale)}</h2><p>{t('No shops near ', locale)}{area} {t('have this item right now. Try another word, or another area.', locale)}</p><Button variant="secondary" onClick={() => setLocationOpen(true)}><MapPin />{t('Change area', locale)}</Button></div>}
      </>}
    </>}
    <p className="trust-note"><ShieldCheck size={14} className="shrink-0 mt-0.5" /><span>{t('No account needed. Availability comes from shop updates and may change before you arrive.', locale)}</span></p>
  </main>;
}
