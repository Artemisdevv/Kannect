import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/components/kannect/shell";
import { StockPage } from "@/features/stock/stock-page";

export const Route = createFileRoute("/stock")({
  head: () => pageHead("Stock", "Check and update your shop stock."),
  component: StockPage,
});
