import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/components/kannect/shell";
import { GroupBuyDetailPage } from "@/features/group-buys/group-buy-detail-page";

export const Route = createFileRoute("/group-buys/$id")({
  head: () => pageHead("Group buy", "See a supplier deal and join it with other shops."),
  component: GroupBuyRoute,
});

function GroupBuyRoute() {
  const { id } = Route.useParams();
  return <GroupBuyDetailPage id={id} />;
}
