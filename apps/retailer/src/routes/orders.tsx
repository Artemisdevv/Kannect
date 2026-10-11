import { createFileRoute } from '@tanstack/react-router';
import { OrdersPage, pageHead } from '@/components/kadanet/retailer-app';
export const Route = createFileRoute('/orders')({ head:()=>pageHead('Orders','Review restock suggestions and track your supplier orders.'),component:OrdersPage });
