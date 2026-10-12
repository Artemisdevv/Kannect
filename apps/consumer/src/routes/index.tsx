import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Store, MapPin, ArrowUpRight, Search, ShieldCheck, Loader2, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShopper } from '@/components/shopper-shell';
import { ShopMap } from '@/components/shop-map';
import groceries from '@/assets/neighbourhood-groceries.jpg';
import { t, useLocale } from '@/lib/i18n';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Nearby neighbourhood shops — Kannect' },
    { name: 'description', content: 'Discover neighbourhood shops in your chosen area with Kannect.' },
    { property: 'og:title', content: 'Nearby neighbourhood shops — Kannect' },
    { property: 'og:description', content: 'Discover the local shops around your neighbourhood.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: NearbyPage,
});

function NearbyPage() {
  const locale = useLocale();
  const { area, nearby, nearbyLoading, nearbyError, setLocationOpen } = useShopper();
  const [selectedShopId, setSelectedShopId] = useState<string>();
  return <main className="app-main">
    <div className="welcome"><p className="eyebrow">{t('A little closer. A little easier.', locale)}</p><h1>{t('Your neighbourhood, ', locale)}<span>{t('nearby.', locale)}</span></h1></div>
    <div className="intro-photo"><img src={groceries} alt={t('Fresh vegetables, fruit, milk and rice from a neighbourhood grocery shop', locale)} width={1536} height={768} fetchPriority="high" /><div className="intro-photo-copy"><h2>{t('Everyday needs.', locale)}<br />{t('Nearby shops.', locale)}</h2><p>{area}</p></div></div>
    <div className="section-heading"><div><h2>{t('Shops around you', locale)}</h2><p>{area} · {nearbyLoading ? t('Looking…', locale) : `${nearby.length} ${t(nearby.length === 1 ? 'shop' : 'shops', locale)}`}</p></div><Button variant="ghost" size="icon" aria-label={t('Change neighbourhood', locale)} onClick={() => setLocationOpen(true)}><MapPin /></Button></div>
    {nearbyLoading ? <div className="empty-state" role="status"><Loader2 className="animate-spin" /><h2>{t('Finding shops near you…', locale)}</h2></div> : nearbyError ? <div className="empty-state" role="alert"><SearchX /><h2>{t('Let’s try that again', locale)}</h2><p>{t(nearbyError, locale)}</p><Button onClick={() => setLocationOpen(true)}>{t('Change area', locale)}</Button></div> : nearby.length ? <><ShopMap shops={nearby} selectedId={selectedShopId} onSelect={setSelectedShopId} /><div className="shop-list" aria-label={t('Neighbourhood shops', locale)}>{nearby.map(shop => <article className={`shop-card${selectedShopId === shop.id ? ' selected' : ''}`} key={shop.uid} onFocus={() => setSelectedShopId(shop.id)} onMouseEnter={() => setSelectedShopId(shop.id)}><div className="shop-art"><Store /></div><div className="min-w-0"><h3>{shop.name}</h3><p>{shop.address}</p>{shop.distanceKm !== undefined && <p>{shop.distanceKm.toFixed(1)}{t(' km away', locale)}</p>}</div><Button variant="ghost" size="icon" asChild><Link to="/shops/$shopId" params={{ shopId: shop.id }} aria-label={`${t('View ', locale)}${shop.name}`}><ArrowUpRight /></Link></Button></article>)}</div></> : <div className="empty-state"><Store /><h2>{t('No shops in this area yet', locale)}</h2><p>{t('No shops with saved locations in ', locale)}{area}.</p><Button variant="secondary" onClick={() => setLocationOpen(true)}>{t('Change area', locale)}</Button></div>}
    <Button asChild className="mt-6 w-full"><Link to="/search"><Search />{t('Find an item', locale)}</Link></Button>
    <p className="trust-note"><ShieldCheck size={14} />{t('No account needed. Coordinates are used for this request and aren’t saved by the app.', locale)}</p>
  </main>;
}
