import { createFileRoute } from '@tanstack/react-router';
import { StockPage, pageHead } from '@/components/kadanet/retailer-app';
export const Route = createFileRoute('/stock')({ head:()=>pageHead('Stock','Check and update your shop stock, including unknown quantities.'),component:StockPage });
