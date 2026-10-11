import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/components/kannect/shell";
import { MorePage } from "@/features/home/more-page";

export const Route = createFileRoute("/more")({
  head: () => pageHead("More", "Set up from a photo, recount stock and sign out."),
  component: MorePage,
});
