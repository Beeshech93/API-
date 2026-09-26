const API_ORIGIN = process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Dashboard and admin calls go through this same-origin proxy so the httpOnly
  // refresh cookie is a first-party cookie of the portal. (The portal and API
  // sit on different *.vercel.app sites, and browsers block cross-site cookies.)
  // Customer integrations still call the API's own domain directly.
  // The dashboard handles money and identity documents: it must not be embeddable in another site
  // (clickjacking), sniffed as another type, or leak its address in a Referer header.
  async headers() {
    const csp = [
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
