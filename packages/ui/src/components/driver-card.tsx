import * as React from "react";
import { UserRound, BadgeCheck } from "lucide-react";
import { cn } from "../lib/cn";
import { StarRating } from "./star-rating";

export interface DriverCardProps {
  name: string;
  rating: number;
  vehicleLabel: string;
  plateNumber: string;
  verified?: boolean;
  etaLabel?: string;
  photoUrl?: string | null;
  className?: string;
}

/**
 * The driver-identity card on Active Ride — the one place a passenger
 * confirms "this is my driver" mid-trip. A real, recognizable portrait
 * (the driver's own verified selfie, when one exists) is the point of
 * this component; everything else is plain text around it, not
 * decoration competing with it.
 */
export function DriverCard({ name, rating, vehicleLabel, plateNumber, verified, etaLabel, photoUrl, className }: DriverCardProps) {
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-md", className)}>
      <span className="relative flex h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-signal-blue/30 bg-tint-blue text-signal-blue shadow-sm">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={`${name}'s photo`} className="h-full w-full object-cover" />
        ) : (
          <UserRound size={40} className="m-auto" strokeWidth={1.5} />
        )}
        {verified && (
          <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-meter-green text-white shadow-sm">
            <BadgeCheck size={13} strokeWidth={3} />
          </span>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-display text-base font-bold text-ink">{name}</p>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <StarRating value={rating} readOnly size={13} />
          <span className="font-meter text-xs font-bold text-ink">{rating.toFixed(1)}</span>
          {verified && (
            <span className="text-[11px] font-semibold text-meter-green-text">
              · Verified Driver
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded bg-ink/5 px-2 py-0.5 font-meter text-xs font-bold tracking-wider text-ink border border-border">
            {plateNumber}
          </span>
          <span className="text-xs text-ink-soft">{vehicleLabel}</span>
        </div>
      </div>

      {etaLabel && (
        <div className="shrink-0 rounded-xl bg-meter-green/10 px-3 py-2 text-center border border-meter-green/20">
          <p className="font-meter text-sm font-bold tabular-nums text-meter-green-text">{etaLabel}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-meter-green-text">Away</p>
        </div>
      )}
    </div>
  );
}
