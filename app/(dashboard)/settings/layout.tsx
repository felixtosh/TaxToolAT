"use client";

import { usePathname } from "next/navigation";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";

// Routes that need full-width content (no max-w-4xl constraint)
const fullWidthRoutes = ["/settings/categories", "/settings/integrations"];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFullWidth = fullWidthRoutes.some((route) => pathname.startsWith(route));

  return (
    <div className="h-[calc(100vh-3.5rem)] flex overflow-hidden">
      <SettingsSidebar />
      {/* Main Content */}
      {isFullWidth ? (
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl p-8">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
