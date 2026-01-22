"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Shield, User, Tag, Link2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const settingsNavItems = [
  { href: "/settings/sign-in", label: "Sign-in Methods", icon: Mail },
  { href: "/settings/security", label: "Security", icon: Shield },
  { href: "/settings/identity", label: "Your Identity", icon: User },
  { href: "/settings/usage", label: "Usage", icon: Activity },
  { href: "/settings/categories", label: "Categories", icon: Tag },
  { href: "/settings/integrations", label: "Integrations", icon: Link2 },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-56 border-r bg-muted/30 p-4 shrink-0 overflow-y-auto">
      <h1 className="text-lg font-semibold mb-4">Settings</h1>
      <ul className="space-y-1">
        {settingsNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href === "/settings/identity" && pathname === "/settings") ||
            (item.href === "/settings/categories" && pathname.startsWith("/settings/categories")) ||
            (item.href === "/settings/integrations" && pathname.startsWith("/settings/integrations"));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
