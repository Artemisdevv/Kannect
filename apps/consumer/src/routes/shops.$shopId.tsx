import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Store, Navigation, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShopper } from '@/components/shopper-shell';
import { ShopCard, Availability } from '@/components/shop-result';
import { alternatives, exampleShops, rupees } from '@/lib/shopper';
export const Route = createFileRoute('/shops/$shopId')({
  head: ({ params }) => ({ meta: [
    { title: `${params.shopId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')} — KadaNet shop availability` },
    { name: 'description', content: 'Check reported product availability at this local shop and find nearby alternatives.' },
    { property: 'og:title', content: 'Local shop availability — KadaNet' },
    { property: 'og:description', content: 'Find everyday essentials and alternative local shops with KadaNet.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: ShopDetail,
});
function ShopDetail() {
  const { shopId } = Route.useParams();
  const { response, nearby: discoveryShops } = useShopper();
  const hasProduct = response?.shops.some(s => s.id === shopId) ?? false;
  const shops = hasProduct && response ? response.shops : [...discoveryShops, ...exampleShops.filter(s => !discoveryShops.some(n => n.id === s.id))];
  const shop = shops.find(s => s.id === shopId);
  if (!shop) return <main className="app-main"><div className="empty-state"><Store /><h1>Shop not found</h1><p>Search again to find shops and their current reported availability.</p><Button asChild><Link to="/search">Back to search</Link></Button></div></main>;
  const nearby = alternatives(shops, shop);
  return <main className="app-main"><Button variant="ghost" asChild className="-ml-4"><Link to={hasProduct ? '/search' : '/'}><ArrowLeft />{hasProduct ? 'Back to results' : 'Back to nearby shops'}</Link></Button><div className="detail-header"><div className="detail-symbol"><Store /></div><h1>{shop.name}</h1><p>{shop.address}{shop.distanceKm !== undefined && <><br />{shop.distanceKm.toFixed(1)} km away</>}</p></div>
    <div className="demo-banner"><Info size={14} />{response?.cachedAt ? 'Saved demo availability — may be out of date.' : 'Example shop — not live availability.'}</div>
    {hasProduct ? <div className="detail-product"><div className="min-w-0"><h2>{shop.product}</h2><Availability status={shop.status} /><p>Example stock update · {shop.updatedMinutes} minutes ago</p></div><span className="detail-price">{rupees(shop.price)}</span></div> : <Button asChild className="mt-6"><Link to="/search">Search for an item</Link></Button>}
    <Button variant="secondary" asChild className="mt-5"><a href={`https://www.google.com/maps/dir/?api=1&destination=${shop.coordinates.latitude},${shop.coordinates.longitude}`} target="_blank" rel="noopener noreferrer"><Navigation />Directions to example location</a></Button>
    {hasProduct && shop.status === 'out' ? <><div className="local-note"><Info size={26} /><div><h3>Reported out at this shop</h3><p>{nearby.length ? 'These other example shops report the same item in stock.' : 'There are no in-stock alternatives in these results. Try another area or product.'}</p></div></div><div className="section-heading"><h2>Try another nearby shop</h2></div><div className="shop-list">{nearby.map(s => <ShopCard key={s.id} shop={s} />)}</div></> : <div className="local-note"><Info size={26} /><div><h3>A quick heads-up</h3><p>Availability is reported by shops and can change. Demo results don’t confirm that an item is available.</p></div></div>}
  </main>;
}