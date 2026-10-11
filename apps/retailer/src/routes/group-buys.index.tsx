import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/components/kannect/shell";
import { GroupBuysPage } from "@/features/group-buys/group-buys-page";

export const Route = createFileRoute("/group-buys/")({
  head: () => pageHead("Group buys", "Join supplier group buys with other shops to unlock lower prices."),
  component: GroupBuysPage,
});
