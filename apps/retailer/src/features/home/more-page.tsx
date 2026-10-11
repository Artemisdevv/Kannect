import { Link, useNavigate } from "@tanstack/react-router";
import { Camera, ChevronRight, ClipboardCheck, LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { signOut } from "@/api";
import { Shell, useShop } from "@/components/kannect/shell";
import { Button } from "@/components/ui/button";

export function MorePage() {
  const shop = useShop();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const logout = async () => {
    signOut();
    qc.clear(); // never show the next person at this phone the previous shop's data
    await navigate({ to: "/login" });
  };

  const items = [
    { to: "/onboard" as const, icon: Camera, label: "Set up from a shelf photo", sub: "Add many products at once" },
    { to: "/stock" as const, icon: ClipboardCheck, label: "Weekly recount", sub: "Check and update your counts" },
  ];

  return (
    <Shell active="More">
      <p className="eyebrow">{shop?.name}</p>
      <h1>More</h1>

      <div className="list-surface mt-4">
        {items.map((item) => (
          <Button key={item.label} variant="ghost" className="w-full justify-between border-b rounded-none h-16 px-4" asChild>
            <Link to={item.to}>
              <span className="flex items-center gap-3">
                <item.icon />
                <span className="text-left">
                  {item.label}
                  <span className="block text-xs text-muted-foreground font-normal">{item.sub}</span>
                </span>
              </span>
              <ChevronRight />
            </Link>
          </Button>
        ))}
      </div>

      <div className="list-surface mt-4 p-4 text-sm space-y-1">
        <p className="font-semibold">{shop?.name}</p>
        {shop?.address && <p className="text-muted-foreground">{shop.address}</p>}
        {shop?.shop_type && <p className="text-muted-foreground capitalize">{shop.shop_type} shop</p>}
      </div>

      <Button variant="outline" className="w-full mt-4" onClick={() => void logout()}>
        <LogOut /> Sign out
      </Button>
    </Shell>
  );
}
