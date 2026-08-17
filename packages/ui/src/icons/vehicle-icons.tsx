import * as React from "react";

export interface VehicleIconProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
}

function makeVehicleIcon(paths: React.ReactNode, displayName: string) {
  const IconComponent = React.forwardRef<SVGSVGElement, VehicleIconProps>(
    ({ size = 24, strokeWidth = 1.7, className, ...props }, ref) => (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...props}
      >
        {paths}
      </svg>
    )
  );
  IconComponent.displayName = displayName;
  return IconComponent;
}

/** Auto-rickshaw — canopy roof over the rear cabin, open driver footwell, twin rear wheels read as one from the side. */
export const AutoIcon = makeVehicleIcon(
  <>
    <path d="M4.5 16.3V11.6c0-.8.4-1.5 1.1-1.9l1.9-1c.6-.3 1-1 1-1.7V5.8" />
    <path d="M8.5 6.6c.4-.5 1.1-.8 2-.8h2.7c1.9 0 3.2 1.1 3.7 2.9l1 3.6" />
    <path d="M4.5 11.8h14.2c1.1 0 2 .9 2 2v1.3c0 .7-.5 1.2-1.2 1.2h-.8" />
    <path d="M9.3 16.3h5.2" />
    <path d="M4.3 16.3H3" />
    <circle cx="6.6" cy="17.9" r="1.7" />
    <circle cx="17.6" cy="17.9" r="1.7" />
  </>,
  "AutoIcon"
);

/** Motorcycle — angular fuel tank + fork, two full-size wheels. */
export const BikeIcon = makeVehicleIcon(
  <>
    <circle cx="5" cy="17.5" r="2.3" />
    <circle cx="18" cy="17.5" r="2.3" />
    <path d="M5 17.5h3.5l2.8-4.2h4.3l2.4 4.2" />
    <path d="M11.3 13.3l1.7-3.3h2.6" />
    <path d="M7.6 10h2.4" />
    <path d="M9.8 10l-1.5 3.1" />
  </>,
  "BikeIcon"
);

/** Scooter — step-through frame, small wheels, tall seat post. */
export const ScootyIcon = makeVehicleIcon(
  <>
    <circle cx="5.3" cy="17.5" r="2.2" />
    <circle cx="17.5" cy="17.5" r="2.2" />
    <path d="M5.3 17.5h1.8v-3.2h5.4" />
    <path d="M12.5 14.3v3.2h5" />
    <path d="M12.9 14.3l2.6-5.3h1.6" />
    <path d="M8.8 9.8h3.3" />
  </>,
  "ScootyIcon"
);

/** Sedan — sloped windshield/rear glass, low full-width body. */
export const CarIcon = makeVehicleIcon(
  <>
    <path d="M4 16v-2.2c0-.5.2-.9.6-1.2l2-1.5c.5-.4 1.1-.6 1.7-.6h6.4c.7 0 1.4.3 1.9.8l1.8 1.9c.3.3.7.5 1.1.6l1.3.3c.6.1 1 .6 1 1.2V16" />
    <path d="M7 12.2l.6-2.6c.2-.7.8-1.1 1.5-1.1h4.3c.5 0 1 .2 1.3.6l2 2.3" />
    <path d="M4 16h16" />
    <circle cx="7.5" cy="17.7" r="1.9" />
    <circle cx="16.5" cy="17.7" r="1.9" />
  </>,
  "CarIcon"
);

export type VehicleKind = "auto" | "bike" | "scooty" | "car";

/** Central mapping — the one place vehicle → icon/color/label is decided, so every screen (booking, ride offer, driver vehicle card, history) reads identically. */
export const VEHICLE_VISUALS: Record<
  VehicleKind,
  { icon: typeof AutoIcon; label: string; colorVar: string; textVar: string; tintVar: string }
> = {
  auto: { icon: AutoIcon, label: "Auto", colorVar: "var(--marigold)", textVar: "var(--marigold-text)", tintVar: "var(--tint-marigold)" },
  bike: { icon: BikeIcon, label: "Bike", colorVar: "var(--violet)", textVar: "var(--violet-text)", tintVar: "var(--tint-violet)" },
  scooty: { icon: ScootyIcon, label: "Scooty", colorVar: "var(--rose)", textVar: "var(--rose-text)", tintVar: "#fdeaf1" },
  car: { icon: CarIcon, label: "Car", colorVar: "var(--cyan)", textVar: "var(--cyan-text)", tintVar: "var(--tint-blue)" },
};
