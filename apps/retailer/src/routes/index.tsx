import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/components/kannect/shell";
import { TodayPage } from "@/features/home/home-page";

export const Route = createFileRoute("/")({
  head: () => pageHead("Today", "Your Kannect shop at a glance. Create bills, check stock and review orders."),
  component: TodayPage,
});
