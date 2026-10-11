import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Info, Loader2, Navigation, Phone, SearchX, Store } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Availability, ShopCard } from '@/components/shop-result';
import { getReferral, getShopPage, rupees, type ShopResult } from '@/lib/shopper';

export const Route = createFileRoute('/shops/$shopId')({
  head: () => ({ meta: [
    { title: 'Shop availability — Kannect' },
    { name: 'description', content: 'Check reported product availability at this local shop and find nearby alternatives.' },
  ] }),
  component: ShopDetail,
});

function ShopDetail() {
  const { shopId } = Route.useParams();
  const page = useQuery({ queryKey: ['shop', shopId], queryFn: () => getShopPage(shopId), retry: 1 });

  if (page.isLoading) return <main className="app-main"><div className="empty-state" role="status"><Loader2 className="animate-spin" /><h2>Loading shop…</h2></div></main>;
  if (page.isError || !page.data) return <main className="app-main"><div className="empty-state" role="alert"><Store /><h1>Shop not found</h1><p>{page.error instanceof Error ? page.error.message : 'We couldn’t load this shop.'}</p><Button asChild><Link to="/search">Back to search</Link></Button></div></main>;

  const { shop, products } = page.data;
  return <main className="app-main">
    <Button variant="ghost" asChild className="-ml-4"><Link to="/"><ArrowLeft />Back</Link></Button>
    <div className="detail-header"><div className="detail-symbol"><Store /></div><h1>{shop.name}</h1><p>{shop.address}</p></div>
    <div className="flex flex-wrap gap-2 mt-4">
      {shop.coordinates && <Button variant="secondary" asChild><a href={`https://www.google.com/maps/dir/?api=1&destination=${shop.coordinates.latitude},${shop.coordinates.longitude}`} target="_blank" rel="noopener noreferrer"><Navigation />Directions</a></Button>}
      {shop.phone && <Button variant="outline" asChild><a href={`tel:${shop.phone}`}><Phone />Call</a></Button>}
    </div>
    <div className="section-heading"><h2>What they have</h2></div>
    {products.length === 0 ? <div className="empty-state"><SearchX /><h2>No products listed yet</h2></div> : <div className="shop-list">{products.map(p => <ProductRow key={p.productId} shop={shop} product={p} />)}</div>}
    <div className="local-note"><Info size={26} /><div><h3>A quick heads-up</h3><p>Availability is reported by the shop and can change before you arrive. We never show exact counts.</p></div></div>
  </main>;
}

function ProductRow({ shop, product }: { shop: ShopResult; product: { productId: string; name: string; price: number | null; status: 'in' | 'low' | 'out' } }) {
  const [asked, setAsked] = useState(false);
  const referral = useQuery({
    queryKey: ['referral', shop.id, product.productId], enabled: asked, retry: 1,
    queryFn: () => getReferral(shop.id, product.productId),
  });
  return <div className="detail-product" style={{ display: 'block' }}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2>{product.name}</h2><Availability status={product.status} /></div><span className="detail-price">{rupees(product.price)}</span></div>
    {product.status === 'out' && !asked && <Button variant="outline" size="sm" className="mt-3" onClick={() => setAsked(true)}>Find it at another shop</Button>}
    {asked && referral.isLoading && <p className="mt-3 text-sm" role="status">Checking nearby shops…</p>}
    {asked && referral.isError && <p className="mt-3 text-sm text-destructive" role="alert">Couldn’t check other shops. Try again later.</p>}
    {asked && referral.data === null && <p className="mt-3 text-sm">No nearby shop reports this item in stock right now.</p>}
    {referral.data && <div className="mt-3"><p className="text-xs text-muted-foreground mb-2">Nearest shop that has it</p><ShopCard shop={referral.data} /></div>}
  </div>;
}
