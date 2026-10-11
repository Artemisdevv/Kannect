import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/components/kannect/shell";
import { OnboardPage } from "@/features/onboard/onboard-page";

export const Route = createFileRoute("/onboard")({
  head: () => pageHead("Shelf photo", "Set up your shop products from a photo of your shelves."),
  component: OnboardPage,
});
