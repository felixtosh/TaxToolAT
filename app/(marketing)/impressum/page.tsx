import { getTranslations } from "next-intl/server";
import { LanguageToggle } from "@/components/landing/language-toggle";
import { LandingFooter } from "@/components/landing/footer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function ImpressumPage() {
  const t = await getTranslations("impressum");
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

          <h1 className="text-3xl font-bold mb-8">{t("title")}</h1>

          <div className="space-y-8">
            {/* Company Info */}
            <section>
              <h2 className="text-xl font-semibold mb-3">
                {t("company.title")}
              </h2>
              <div className="text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{t("company.name")}</p>
                <p className="whitespace-pre-line">{t("company.address")}</p>
                <p>{t("company.register")}</p>
                <p>{t("company.vatId")}</p>
              </div>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-xl font-semibold mb-3">{t("contact.title")}</h2>
              <div className="text-muted-foreground">
                <p>E-Mail: hello@fibuki.com</p>
              </div>
            </section>

            {/* Liability */}
            <section>
              <h2 className="text-xl font-semibold mb-3">
                {t("liability.title")}
              </h2>
              <p className="text-muted-foreground">{t("liability.content")}</p>
            </section>

            {/* Copyright */}
            <section>
              <h2 className="text-xl font-semibold mb-3">
                {t("copyright.title")}
              </h2>
              <p className="text-muted-foreground">{t("copyright.content")}</p>
            </section>
          </div>
        </div>
      </main>

      <LandingFooter />
    </>
  );
}
