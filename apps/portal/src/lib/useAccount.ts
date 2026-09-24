"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";

export interface Account {
  name: string;
  services: { receive: boolean; send: boolean };
  live_access: boolean;
}

// What the signed-in account is set up for (receiving payments and/or sending money).
export function useAccount(): Account | null {
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    api<Account>("/portal/account").then(setAccount).catch(() => setAccount(null));
  }, []);
  return account;
}
