import { createFileRoute } from '@tanstack/react-router';
import { TodayPage, pageHead } from '@/components/kadanet/retailer-app';
export const Route = createFileRoute('/')({ head:()=>pageHead('Today','Your KadaNet shop at a glance. Create bills, check stock and review orders.'),component:TodayPage });
