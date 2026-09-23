import dns from "dns/promises";
import net from "net";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateIPv4(lower.slice(7));
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
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
