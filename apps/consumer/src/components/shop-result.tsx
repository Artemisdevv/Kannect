import { Link } from '@tanstack/react-router';
import { Store, ArrowUpRight, Check, Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { rupees, type ShopResult, type StockStatus } from '@/lib/shopper';
export function Availability({ status }: { status: StockStatus }) {
  const Icon = status === 'in' ? Check : status === 'low' ? Minus : X;
  return <span className={`availability ${status}`}><Icon size={11} />{status === 'in' ? 'In stock' : status === 'low' ? 'Low' : 'Out'}</span>;
}
export function ShopCard({ shop }: { shop: ShopResult }) {
  return <article className="shop-card"><div className="shop-art"><Store /></div><div className="min-w-0"><h3>{shop.name}</h3><p>{shop.product} <span className="text-foreground font-semibold">{rupees(shop.price)}</span></p><div className="shop-meta"><Availability status={shop.status} /><small>{shop.distanceKm !== undefined ? `${shop.distanceKm.toFixed(1)} km · ` : `${shop.area} · `}{shop.updatedMinutes} min ago</small></div></div><Button variant="ghost" size="icon" asChild title={`View ${shop.name}`}><Link to="/shops/$shopId" params={{ shopId: shop.id }} aria-label={`View ${shop.name}`}><ArrowUpRight /></Link></Button></article>;
}