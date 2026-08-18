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
    <div className={cn("flex items-center gap-3.5 rounded-lg border border-border bg-surface p-4", className)}>
      <span className="flex h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-ink/5 text-ink-soft">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={`${name}'s photo`} className="h-full w-full object-cover" />
        ) : (
          <UserRound size={30} className="m-auto" strokeWidth={1.6} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-display text-base font-semibold text-ink">{name}</p>
          <StarRating value={rating} readOnly size={12} />
          <span className="text-xs text-ink-soft">{rating.toFixed(1)}</span>
        </div>
        {verified && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-meter-green-text">
            <BadgeCheck size={13} strokeWidth={2} /> Verified driver
          </p>
        )}
        <p className="mt-0.5 truncate text-xs text-ink-soft">
          {vehicleLabel} · {plateNumber}
        </p>
      </div>
      {etaLabel && (
        <div className="shrink-0 text-right">
          <p className="font-meter text-sm font-semibold tabular-nums text-ink">{etaLabel}</p>
          <p className="text-[11px] text-ink-soft">away</p>
        </div>
      )}
    </div>
  );
}
