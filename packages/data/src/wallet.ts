import type { SupabaseClient } from "@supabase/supabase-js";

export interface WalletRow {
  id: string;
  user_id: string;
  balance: number;
  currency: string;
}

export interface WalletTransactionRow {
  id: string;
  wallet_id: string;
  type: "credit" | "debit";
  reason: "ride_earning" | "withdrawal" | "subscription_payment" | "refund" | "promo_credit" | "adjustment";
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

/**
 * Read-only, deliberately — Phase 3 gave `wallets`/`wallet_transactions` no
 * client-writable policy at all ("balance changes must go through a
 * trusted server path"). This module only ever selects. There is no
 * `createWalletTransaction()` here; a real withdrawal or ride-earning
 * credit belongs in a service-role Edge Function or RPC in a later phase,
 * not the client. See the Driver Wallet screen's "Withdraw" button, which
 * stays a UI-only placeholder for exactly this reason.
 */
export async function getWallet(supabase: SupabaseClient, userId: string): Promise<WalletRow | null> {
  const { data, error } = await supabase
    .from("wallets")
    .select("id, user_id, balance, currency")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as WalletRow | null;
}

export async function listWalletTransactions(
  supabase: SupabaseClient,
  walletId: string,
  limit = 20
): Promise<WalletTransactionRow[]> {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("id, wallet_id, type, reason, amount, balance_after, description, created_at")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as WalletTransactionRow[];
}
