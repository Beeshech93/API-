import { PaymentProvider } from "@ayitipay/shared";
import { monCashAdapter } from "@/providers/moncash/moncash.adapter";
import { natCashAdapter } from "@/providers/natcash/natcash.adapter";
import { PaymentProviderAdapter } from "@/providers/provider.types";

export function getAdapter(provider: PaymentProvider): PaymentProviderAdapter {
  return provider === "MONCASH" ? monCashAdapter : natCashAdapter;
}
