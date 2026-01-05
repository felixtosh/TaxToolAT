"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Receipt, Building2, Users, Settings } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChatProvider, ChatSidebar, useChat } from "@/components/chat";

const navItems = [
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/sources", label: "Accounts", icon: Building2 },
  { href: "/partners", label: "Partners", icon: Users },
];

function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isSidebarOpen } = useChat();

  return (
    <div
      className={cn(
        "h-screen bg-background transition-all duration-300 ease-in-out overflow-hidden",
        isSidebarOpen ? "md:ml-80" : "ml-0"
      )}
    >
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/transactions" className="flex items-center gap-2 hover:opacity-80">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="font-semibold text-lg">TaxStudio</span>
            </Link>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              Dev Mode
            </span>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/admin/partners">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="h-[calc(100vh-3.5rem)] overflow-hidden">{children}</main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ChatProvider>
      <ChatSidebar />
      <DashboardContent>{children}</DashboardContent>
    </ChatProvider>
  );
}
