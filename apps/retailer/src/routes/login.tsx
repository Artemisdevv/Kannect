import { createFileRoute } from "@tanstack/react-router";

import { pageHead } from "@/components/kannect/shell";
import { LoginPage } from "@/features/auth/login-page";

export const Route = createFileRoute("/login")({
  head: () => pageHead("Sign in", "Sign in to your Kannect shop with your phone number."),
  component: LoginPage,
});
