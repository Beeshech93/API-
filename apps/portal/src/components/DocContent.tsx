"use client";

import { useLocale } from "@/lib/i18n";
import EnGettingStarted from "@/content/docs/en/getting-started.mdx";
import EsGettingStarted from "@/content/docs/es/getting-started.mdx";
import FrGettingStarted from "@/content/docs/fr/getting-started.mdx";
import EnAuthentication from "@/content/docs/en/authentication.mdx";
import EsAuthentication from "@/content/docs/es/authentication.mdx";
import FrAuthentication from "@/content/docs/fr/authentication.mdx";
import EnPayments from "@/content/docs/en/payments.mdx";
import EsPayments from "@/content/docs/es/payments.mdx";
import FrPayments from "@/content/docs/fr/payments.mdx";
import EnWebhooks from "@/content/docs/en/webhooks.mdx";
import EsWebhooks from "@/content/docs/es/webhooks.mdx";
import FrWebhooks from "@/content/docs/fr/webhooks.mdx";
import EnErrors from "@/content/docs/en/errors.mdx";
import EsErrors from "@/content/docs/es/errors.mdx";
import FrErrors from "@/content/docs/fr/errors.mdx";
import type { Locale } from "@/lib/i18n";

export type DocSlug = "getting-started" | "authentication" | "payments" | "webhooks" | "errors";

const DOCS: Record<DocSlug, Record<Locale, React.ComponentType>> = {
  "getting-started": { en: EnGettingStarted, es: EsGettingStarted, fr: FrGettingStarted },
  authentication: { en: EnAuthentication, es: EsAuthentication, fr: FrAuthentication },
  payments: { en: EnPayments, es: EsPayments, fr: FrPayments },
  webhooks: { en: EnWebhooks, es: EsWebhooks, fr: FrWebhooks },
  errors: { en: EnErrors, es: EsErrors, fr: FrErrors },
};

export function DocContent({ slug }: { slug: DocSlug }) {
  const { locale } = useLocale();
  const Doc = DOCS[slug][locale];
  return <Doc />;
}
