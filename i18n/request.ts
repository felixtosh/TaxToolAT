import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export const locales = ["de", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";

export default getRequestConfig(async () => {
  // Try to get locale from cookie first
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("locale")?.value as Locale | undefined;

  if (localeCookie && locales.includes(localeCookie)) {
    return {
      locale: localeCookie,
      messages: (await import(`../messages/${localeCookie}.json`)).default,
    };
  }

  // Fall back to Accept-Language header
  const headersList = await headers();
  const acceptLanguage = headersList.get("accept-language");
  const browserLocale = acceptLanguage?.split(",")[0]?.split("-")[0] as
    | Locale
    | undefined;

  const locale =
    browserLocale && locales.includes(browserLocale)
      ? browserLocale
      : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
