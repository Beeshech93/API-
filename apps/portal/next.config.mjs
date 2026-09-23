const API_ORIGIN = process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Dashboard and admin calls go through this same-origin proxy so the httpOnly
  // refresh cookie is a first-party cookie of the portal. (The portal and API
  // sit on different *.vercel.app sites, and browsers block cross-site cookies.)
  // Customer integrations still call the API's own domain directly.
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
