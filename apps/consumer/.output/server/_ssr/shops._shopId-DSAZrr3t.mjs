import { _ as lazyRouteComponent, v as createFileRoute } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/shops._shopId-DSAZrr3t.js
var $$splitComponentImporter = () => import("./shops._shopId-kHIN-uOP.mjs");
var Route = createFileRoute("/shops/$shopId")({
	head: ({ params }) => ({ meta: [{ title: `Shop availability — ${params.shopId} — KadaNet` }, {
		name: "description",
		content: "Check reported product availability at this local shop and find nearby alternatives."
	}] }),
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
//#endregion
export { Route as t };
