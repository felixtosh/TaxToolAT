"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Shield, User, Tag, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Navigation items matching the cogwheel settings order
const settingsNavItems = [
  { href: "/settings/sign-in", label: "Sign-in Methods", icon: Mail },
  { href: "/settings/security", label: "Security", icon: Shield },
  { href: "/settings/identity", label: "Your Identity", icon: User },
  { href: "/categories", label: "No-Receipt Categories", icon: Tag },
  { href: "/integrations", label: "Integrations", icon: Link2 },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="h-[calc(100vh-3.5rem)] flex overflow-hidden">
      {/* Fixed Navigation Sidebar */}
      <nav className="w-56 border-r bg-muted/30 p-4 shrink-0 overflow-y-auto">
        <h1 className="text-lg font-semibold mb-4">Settings</h1>
        <ul className="space-y-1">
          {settingsNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href ||
              (item.href === "/settings/identity" && pathname === "/settings");
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

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
