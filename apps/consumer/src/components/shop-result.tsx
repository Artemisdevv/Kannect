import { Link } from '@tanstack/react-router';
import { Store, ArrowUpRight, Check, Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { rupees, type ShopResult, type StockStatus } from '@/lib/shopper';
export function Availability({ status }: { status: StockStatus }) {
  const Icon = status === 'in' ? Check : status === 'low' ? Minus : X;
  return <span className={`availability ${status}`}><Icon size={11} />{status === 'in' ? 'In stock' : status === 'low' ? 'Low' : 'Out'}</span>;
}
export function ShopCard({ shop, selected = false, onSelect }: { shop: ShopResult; selected?: boolean; onSelect?: () => void }) {
  const where = shop.distanceKm !== undefined ? `${shop.distanceKm.toFixed(1)} km away` : shop.area;
  return <article className={`shop-card${selected ? ' selected' : ''}`} onFocus={onSelect} onMouseEnter={onSelect}><div className="shop-art"><Store /></div><div className="min-w-0"><h3>{shop.name}</h3><p>{shop.product} <span className="text-foreground font-semibold">{rupees(shop.price)}</span></p><div className="shop-meta">{shop.status && <Availability status={shop.status} />}<small>{where}</small></div></div><Button variant="ghost" size="icon" asChild title={`View ${shop.name}`}><Link to="/shops/$shopId" params={{ shopId: shop.id }} aria-label={`View ${shop.name}`}><ArrowUpRight /></Link></Button></article>;
}
