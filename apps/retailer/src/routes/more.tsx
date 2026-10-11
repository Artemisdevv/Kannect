import { createFileRoute } from '@tanstack/react-router';
import { MorePage, pageHead } from '@/components/kadanet/retailer-app';
export const Route = createFileRoute('/more')({ head:()=>pageHead('More','Manage your shop profile, recount stock and export your demo data.'),component:MorePage });
