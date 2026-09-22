import Link from "next/link";

export default function DocsIndexPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-navy mb-4">AyitiPay docs</h1>
      <p className="text-slate-600 mb-6">
        Start with <Link href="/docs/getting-started" className="text-navy underline">Getting started</Link>,
        or jump straight to the <Link href="/docs/console" className="text-navy underline">try-it console</Link>{" "}
        with a test API key.
      </p>
    </div>
  );
}
