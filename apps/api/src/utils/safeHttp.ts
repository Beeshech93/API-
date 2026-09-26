import dns from "dns";
import http from "http";
import https from "https";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import { assertPublicHttpUrl, isPrivateIp } from "@/utils/ssrf";

// An outbound HTTP request to an address someone else chose (a client's webhook, a website named
// in a verification). Two things make it safe:
//   - the address is validated by the SAME lookup that opens the connection, so a DNS answer that
//     changes between the check and the connect (DNS rebinding) can't slip in an internal address;
//   - redirects are never followed, and the answer is read only up to a small limit.
const LOCAL_DEV_HOSTS = ["localhost", "127.0.0.1", "::1"];

export interface SafeResponse {
  status: number;
  text: string;
}

function lookup(hostname: string, options: dns.LookupOptions | number | undefined, callback: (...args: any[]) => void) {
  const opts = typeof options === "object" && options !== null ? options : {};
  if (!env.isProduction && LOCAL_DEV_HOSTS.includes(hostname)) {
    return dns.lookup(hostname, opts as dns.LookupOptions, callback as never);
  }
  dns.lookup(hostname, { ...opts, all: true }, (error, addresses) => {
    const list = (addresses ?? []) as dns.LookupAddress[];
    if (error) return callback(error);
    if (list.length === 0 || list.some((a) => isPrivateIp(a.address))) return callback(new Error("blocked: not a public address"));
    if ((opts as dns.LookupOneOptions).all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

export async function safeRequest(
  rawUrl: string,
  options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number } = {}
): Promise<SafeResponse> {
  await assertPublicHttpUrl(rawUrl); // scheme, credentials, literal addresses, first DNS check
  const url = new URL(rawUrl);
  const { method = "GET", headers = {}, body, timeoutMs = 8_000, maxBytes = 64 * 1024 } = options;
  const client = url.protocol === "https:" ? https : http;

  return new Promise<SafeResponse>((resolve, reject) => {
    const req = client.request(
      url,
      { method, headers: { ...headers, ...(body !== undefined ? { "Content-Length": String(Buffer.byteLength(body)) } : {}) }, lookup: lookup as never, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= maxBytes) chunks.push(chunk);
          else res.destroy(); // enough to know what it said
        });
        const done = () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") });
        res.on("end", done);
        res.on("close", done);
        res.on("error", done);
      }
    );
    const timer = setTimeout(() => req.destroy(new AppError("PROVIDER_TIMEOUT", "The request timed out.")), timeoutMs);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.on("close", () => clearTimeout(timer));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

