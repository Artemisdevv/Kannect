export const seo = (title: string, description: string) => ({
  meta: [
    { title: `${title} · KadaNet Supplier` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} · KadaNet Supplier` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
