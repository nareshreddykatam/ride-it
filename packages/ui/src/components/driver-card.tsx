import * as React from "react";
import { UserRound } from "lucide-react";
import { cn } from "../lib/cn";
import { StarRating } from "./star-rating";

export interface DriverCardProps {
  name: string;
  rating: number;
  vehicleLabel: string;
  plateNumber: string;
  etaLabel?: string;
  photoUrl?: string | null;
  className?: string;
}

/**
 * The driver-identity overlay on Active Ride — the one place a passenger
 * confirms "this is my driver" mid-trip. Deliberately dense: everything
 * that answers "is this the right car, and when do they arrive" in one
 * glance, no scrolling.
 */
export function DriverCard({ name, rating, vehicleLabel, plateNumber, etaLabel, photoUrl, className }: DriverCardProps) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-lg", className)}>
      <span className="flex h-12 w-12 shrink-0 overflow-hidden rounded-full bg-tint-blue text-signal-blue">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound size={26} className="m-auto" strokeWidth={1.7} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold text-ink">{name}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
          <StarRating value={rating} readOnly size={12} />
          <span>{rating.toFixed(1)}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">
            {vehicleLabel} · {plateNumber}
          </span>
        </div>
      </div>
      {etaLabel && (
        <div className="shrink-0 rounded-lg bg-meter-green/10 px-2.5 py-1.5 text-center">
          <p className="font-meter text-sm font-semibold tabular-nums text-meter-green-text">{etaLabel}</p>
        </div>
      )}
    </div>
  );
}
