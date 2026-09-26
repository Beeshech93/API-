import dns from "dns/promises";
import net from "net";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";

// Everything that is not a public internet address: loopback, private, link-local (cloud
// metadata lives at 169.254.169.254), carrier-grade NAT, documentation/test ranges, multicast,
// reserved, unique-local IPv6, and the IPv6 forms that embed an IPv4 address. IPv4-mapped IPv6
// addresses are checked against the IPv4 rules by BlockList itself.
const NON_PUBLIC = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) NON_PUBLIC.addSubnet(network, prefix, "ipv4");
NON_PUBLIC.addAddress("::", "ipv6");
NON_PUBLIC.addAddress("::1", "ipv6");
for (const [network, prefix] of [["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8]] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv6");
}

export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (!family) return true; // not an address at all: never treat as safe
  return NON_PUBLIC.check(ip, family === 4 ? "ipv4" : "ipv6");
}

// Webhook targets are chosen by clients, so without this a client could make
// the platform call internal services or cloud metadata endpoints (SSRF).
// Checked when the webhook is registered and again before every delivery.
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError("INVALID_REQUEST", "Webhook URL is not valid.");
  }
  if (env.isProduction && url.protocol !== "https:") {
    throw new AppError("INVALID_REQUEST", "Webhook URL must use HTTPS.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppError("INVALID_REQUEST", "Webhook URL must be http(s).");
  }
  if (url.username || url.password) {
    throw new AppError("INVALID_REQUEST", "Webhook URL must not contain credentials.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (env.isProduction || !["localhost", "127.0.0.1", "::1"].includes(host)) {
    const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
    if (addresses.length === 0) throw new AppError("INVALID_REQUEST", "Webhook host could not be resolved.");
    if (addresses.some((a) => isPrivateIp(a.address))) {
      throw new AppError("INVALID_REQUEST", "Webhook URL must point to a public address.");
    }
  }
}
