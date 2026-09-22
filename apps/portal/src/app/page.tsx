import Link from "next/link";

export default function HomePage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-24 text-center">
      <h1 className="text-5xl font-extrabold text-navy mb-6">
        One API for MonCash &amp; NatCash
      </h1>
      <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10">
        AyitiPay gives developers a single, unified way to accept mobile money payments
        in Haiti — connect your own MonCash and NatCash merchant accounts, get a
        sandbox in seconds, and go live when you&apos;re ready.
      </p>
      <div className="flex gap-4 justify-center">
        <Link href="/signup" className="bg-navy text-white px-6 py-3 rounded-full font-semibold">
          Get started free
        </Link>
        <Link href="/docs" className="border border-navy text-navy px-6 py-3 rounded-full font-semibold">
          Read the docs
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 text-left">
        <Feature title="Unified API" body="One request shape for both MonCash and NatCash — create a payment, check status, get notified." />
        <Feature title="Bring your own account" body="Connect your own MonCash and NatCash merchant credentials — funds settle directly to you." />
        <Feature title="Sandbox included" body="Every app gets a safe TEST mode that never touches real money, with a try-it console in the docs." />
      </div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
      <h3 className="font-semibold text-navy mb-2">{title}</h3>
      <p className="text-slate-600 text-sm">{body}</p>
    </div>
  );
}
