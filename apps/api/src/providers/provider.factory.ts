import { LiveProvider } from "@/providers/live.provider";
import { SandboxProvider } from "@/providers/sandbox.provider";
import { PaymentProviderClient } from "@/providers/provider.types";

const live = new LiveProvider();
const sandbox = new SandboxProvider();

// TEST keys are always routed to the sandbox, LIVE keys always to the real
// provider — the environment is decided by the API key, never by the request.
export function getProvider(environment: "TEST" | "LIVE"): PaymentProviderClient {
  return environment === "TEST" ? sandbox : live;
}

export function getLiveProvider(): PaymentProviderClient {
  return live;
}
