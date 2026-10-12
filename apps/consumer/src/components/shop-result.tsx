import { Link } from '@tanstack/react-router';
import { Store, ArrowUpRight, Check, Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { rupees, type ShopResult, type StockStatus } from '@/lib/shopper';
import { t, useLocale } from '@/lib/i18n';
export function Availability({ status }: { status: StockStatus }) {
  const locale = useLocale();
  const Icon = status === 'in' ? Check : status === 'low' ? Minus : X;
  return <span className={`availability ${status}`}><Icon size={11} />{t(status === 'in' ? 'In stock' : status === 'low' ? 'Low' : 'Out', locale)}</span>;
}
export function ShopCard({ shop, selected = false, onSelect }: { shop: ShopResult; selected?: boolean; onSelect?: () => void }) {
  const locale = useLocale();
  const where = shop.distanceKm !== undefined ? `${shop.distanceKm.toFixed(1)}${t(' km away', locale)}` : shop.area;
  return <article className={`shop-card${selected ? ' selected' : ''}`} onFocus={onSelect} onMouseEnter={onSelect}><div className="shop-art"><Store /></div><div className="min-w-0"><h3>{shop.name}</h3><p>{shop.product} <span className="text-foreground font-semibold">{rupees(shop.price)}</span></p><div className="shop-meta">{shop.status && <Availability status={shop.status} />}<small>{where}</small></div></div><Button variant="ghost" size="icon" asChild title={`${t('View ', locale)}${shop.name}`}><Link to="/shops/$shopId" params={{ shopId: shop.id }} aria-label={`${t('View ', locale)}${shop.name}`}><ArrowUpRight /></Link></Button></article>;
}
