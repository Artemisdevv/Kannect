import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/components/kannect/shell";
import { OrdersPage } from "@/features/orders/orders-page";

export const Route = createFileRoute("/orders")({
  head: () => pageHead("Orders", "Reorder from suppliers and receive deliveries."),
  component: OrdersPage,
});
