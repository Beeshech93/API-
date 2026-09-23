import { BazikService } from "@/providers/bazik.service";
import { BazikSandbox } from "@/providers/bazik.sandbox";
import { PaymentProviderClient } from "@/providers/provider.types";

const live = new BazikService();
const sandbox = new BazikSandbox();

// TEST keys are always routed to the sandbox, LIVE keys always to the real
// provider — the environment is decided by the API key, never by the request.
export function getProvider(environment: "TEST" | "LIVE"): PaymentProviderClient {
  return environment === "TEST" ? sandbox : live;
}

export function getLiveProvider(): PaymentProviderClient {
  return live;
}
