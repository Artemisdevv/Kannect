import { createFileRoute, Link } from '@tanstack/react-router';
import { Store, MapPin, ArrowUpRight, Search, Info, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShopper } from '@/components/shopper-shell';
import groceries from '@/assets/neighbourhood-groceries.jpg';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'Nearby neighbourhood shops — KadaNet' },
    { name: 'description', content: 'Discover neighbourhood shops in your chosen area with KadaNet. Browse clearly labelled example stores without an account.' },
    { property: 'og:title', content: 'Nearby neighbourhood shops — KadaNet' },
    { property: 'og:description', content: 'Discover the local shops around your neighbourhood.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: NearbyPage,
});

function NearbyPage() {
  const { area, nearby, setLocationOpen } = useShopper();
  return <main className="app-main">
    <div className="welcome"><p className="eyebrow">A little closer. A little easier.</p><h1>Your neighbourhood, <span>nearby.</span></h1></div>
    <div className="intro-photo"><img src={groceries} alt="Fresh vegetables, fruit, milk and rice from a neighbourhood grocery shop" width={1536} height={768} fetchPriority="high" /><div className="intro-photo-copy"><h2>Everyday needs.<br />Nearby shops.</h2><p>{area}</p></div></div>
    <div className="section-heading"><div><h2>Shops around you</h2><p>{area} · {nearby.length} example shops</p></div><Button variant="ghost" size="icon" aria-label="Change neighbourhood" onClick={() => setLocationOpen(true)}><MapPin /></Button></div>
    <div className="demo-banner"><Info size={14} />Example shops — not verified live information.</div>
    {nearby.length ? <div className="shop-list" aria-label="Neighbourhood shops">{nearby.map(shop => <article className="shop-card" key={shop.id}><div className="shop-art"><Store /></div><div className="min-w-0"><h3>{shop.name}</h3><p>{shop.address}</p>{shop.distanceKm !== undefined && <p>{shop.distanceKm.toFixed(1)} km away</p>}</div><Button variant="ghost" size="icon" asChild><Link to="/shops/$shopId" params={{ shopId: shop.id }} aria-label={`View ${shop.name}`}><ArrowUpRight /></Link></Button></article>)}</div> : <div className="empty-state"><Store /><h2>No shops in this area yet</h2><p>No example stores in {area}.</p><Button variant="secondary" onClick={() => setLocationOpen(true)}>Change area</Button></div>}
    <Button asChild className="mt-6 w-full"><Link to="/search"><Search />Find an item</Link></Button>
    <p className="trust-note"><ShieldCheck size={14} />No account needed. Your precise location isn’t saved or shared.</p>
  </main>;
}