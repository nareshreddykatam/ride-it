"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Gift, Share2, Users } from "lucide-react";
import { Button, Card, Skeleton, StatusPill } from "@ride-it/ui";
import { useAuth } from "@ride-it/auth";
import { getSupabaseBrowserClient } from "@ride-it/supabase/client";
import {
  getMyReferralSummary,
  listMyReferrals,
  buildReferralLink,
  type ReferralSummary,
  type ReferralRow,
} from "@ride-it/data";

const STATUS_LABEL: Record<ReferralRow["status"], string> = {
  attributed: "Waiting on their first ride",
  qualified: "Qualified",
  rewarded: "Rewarded",
  expired: "Expired",
};

const STATUS_TONE: Record<ReferralRow["status"], "pending" | "verified" | "online" | "alert"> = {
  attributed: "pending",
  qualified: "online",
  rewarded: "verified",
  expired: "alert",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function PassengerReferPage() {
  const { user } = useAuth();
  const supabase = React.useMemo(() => getSupabaseBrowserClient(), []);
  const [summary, setSummary] = React.useState<ReferralSummary | null>(null);
  const [referrals, setReferrals] = React.useState<ReferralRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    Promise.all([getMyReferralSummary(supabase), listMyReferrals(supabase)])
      .then(([s, r]) => {
        setSummary(s);
        setReferrals(r);
      })
      .finally(() => setLoading(false));
  }, [supabase, user]);

  const link = summary?.referralCode ? buildReferralLink(summary.referralCode) : null;

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the code is still visible to copy manually.
    }
  }

  async function handleShare() {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join RideIT", text: `Use my code ${summary?.referralCode} to join RideIT.`, url: link });
        return;
      } catch {
        // User cancelled the share sheet, or it's unsupported — fall through to copy.
      }
    }
    handleCopy();
  }

  return (
    <main className="flex-1 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/profile" aria-label="Back to profile" className="flex h-9 w-9 items-center justify-center rounded-full border border-border">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-ink">Refer &amp; earn</h1>
      </div>

      {loading ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : !summary?.referralEnabled ? (
        <Card className="mt-6 text-center">
          <Gift size={24} className="mx-auto text-ink-soft" />
          <p className="mt-3 text-sm text-ink">Referrals aren&apos;t live yet</p>
          <p className="mt-1 text-xs text-ink-soft">Check back soon — we&apos;ll let you know when Refer &amp; Earn launches.</p>
        </Card>
      ) : (
        <>
          <Card tone="tinted" className="mt-6 text-center">
            <Gift size={22} className="mx-auto text-signal-blue" />
            <p className="mt-2 text-sm text-ink-soft">Your referral code</p>
            <p className="mt-1 font-display text-3xl font-bold tracking-widest text-ink">{summary?.referralCode ?? "—"}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy} disabled={!link}>
                <Copy size={14} className="mr-1.5" /> {copied ? "Copied!" : "Copy link"}
              </Button>
              <Button size="sm" className="flex-1" onClick={handleShare} disabled={!link}>
                <Share2 size={14} className="mr-1.5" /> Share
              </Button>
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              You&apos;re rewarded once the person you invite completes their first qualifying ride.
            </p>
          </Card>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Card className="text-center">
              <p className="font-display text-2xl font-bold text-ink">{summary?.totalReferrals ?? 0}</p>
              <p className="mt-0.5 text-xs text-ink-soft">Total referrals</p>
            </Card>
            <Card className="text-center">
              <p className="font-display text-2xl font-bold text-meter-green-text">₹{summary?.totalRewardsEarned ?? 0}</p>
              <p className="mt-0.5 text-xs text-ink-soft">Rewards earned</p>
            </Card>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-ink-soft">
              <Users size={14} /> Passengers referred
            </span>
            <span className="font-medium text-ink">{summary?.passengerReferrals ?? 0}</span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-ink-soft">
              <Users size={14} /> Drivers referred
            </span>
            <span className="font-medium text-ink">{summary?.driverReferrals ?? 0}</span>
          </div>

          <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-ink-soft">Referral history</p>
          {referrals.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-ink-soft">
              Share your code — invites you&apos;ve made will show up here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {referrals.map((r) => (
                <Card key={r.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {r.invitee_role === "driver" ? "Driver referral" : "Passenger referral"}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {formatDate(r.created_at)}
                      {r.status !== "attributed" && ` · ${r.qualifying_rides_count}/${r.required_rides_snapshot} rides`}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill>
                    {r.reward_amount != null && <p className="mt-1 text-xs font-medium text-meter-green-text">₹{r.reward_amount}</p>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
