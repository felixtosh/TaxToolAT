"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FibukiMascot } from "@/components/ui/fibuki-mascot";
import { useAuth } from "@/components/auth";
import { cn } from "@/lib/utils";

export function HeroSection() {
  const t = useTranslations("landing.hero");
  const { user, loading } = useAuth();
  const [isLogoJumping, setIsLogoJumping] = useState(false);

  const handleLogoClick = () => {
    if (!isLogoJumping) {
      setIsLogoJumping(true);
      setTimeout(() => setIsLogoJumping(false), 600);
    }
  };

  return (
    <div className="text-center space-y-6 max-w-2xl">
      {/* Logo */}
      <button
        onClick={handleLogoClick}
        className={cn(
          "inline-flex items-center gap-4 logo-wrapper mx-auto",
          isLogoJumping && "is-jumping"
        )}
      >
        <FibukiMascot size={80} isJumping={isLogoJumping} />
        <span className="font-logo font-bold text-6xl text-primary">FiBuKI</span>
      </button>

      {/* Tagline */}
      <h1 className="text-3xl font-semibold text-foreground">{t("title")}</h1>
      <p className="text-lg text-muted-foreground">{t("subtitle")}</p>

      {/* CTA Button */}
      {!loading && (
        <Button asChild size="lg" className="mt-4">
          <Link href={user ? "/transactions" : "/login"}>
            {user ? t("ctaLogin") : t("ctaGetStarted")}
          </Link>
        </Button>
      )}
    </div>
  );
}
