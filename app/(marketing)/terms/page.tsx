import { getTranslations } from "next-intl/server";
import { LanguageToggle } from "@/components/landing/language-toggle";
import { LandingFooter } from "@/components/landing/footer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Sections in the terms of service
const SECTIONS = [
  "acceptance",
  "serviceDescription",
  "useAtOwnRisk",
  "liability",
  "noIndemnification",
  "fees",
  "accountTermination",
  "intellectualProperty",
  "dataHandling",
  "changes",
  "jurisdiction",
  "contact",
] as const;

export default async function TermsPage() {
  const t = await getTranslations("terms");
  const common = await getTranslations("common");

  return (
    <>
      <main className="flex-1 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Back link and language toggle */}
          <div className="flex items-center justify-between mb-8">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {common("back")}
            </Link>
            <LanguageToggle />
          </div>

          <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mb-8">
            {t("lastUpdated", { date: "Januar 2026" })}
          </p>

          <p className="text-muted-foreground mb-8">{t("intro")}</p>

          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <section key={section}>
                <h2 className="text-xl font-semibold mb-3">
                  {t(`sections.${section}.title`)}
                </h2>
                <p className="text-muted-foreground whitespace-pre-line">
                  {t(`sections.${section}.content`)}
                </p>
              </section>
            ))}
          </div>
        </div>
      </main>

      <LandingFooter />
    </>
  );
}
