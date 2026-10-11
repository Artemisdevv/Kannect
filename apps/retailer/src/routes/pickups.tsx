import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/components/kannect/shell";
import { PickupsPage } from "@/features/pickups/pickups-page";

export const Route = createFileRoute("/pickups")({
  head: () => pageHead("Pickup requests", "Shoppers asking you to set items aside. Accept, decline or hand over."),
  component: PickupsPage,
});
