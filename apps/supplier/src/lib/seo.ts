export const seo = (title: string, description: string) => ({
  meta: [
    { title: `${title} · കnnect Supplier` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} · കnnect Supplier` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
