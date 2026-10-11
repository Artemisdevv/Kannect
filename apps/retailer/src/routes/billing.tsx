import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/components/kannect/shell";
import { BillingPage } from "@/features/billing/billing-page";

export const Route = createFileRoute("/billing")({
  head: () => pageHead("Billing", "Create a bill by search, barcode scan or voice."),
  component: BillingPage,
});
