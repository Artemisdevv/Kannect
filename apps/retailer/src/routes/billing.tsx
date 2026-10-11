import { createFileRoute } from '@tanstack/react-router';
import { BillingPage, pageHead } from '@/components/kadanet/retailer-app';
export const Route = createFileRoute('/billing')({ head:()=>pageHead('Billing','Create and review a grocery bill with large phone-friendly controls.'),component:BillingPage });
