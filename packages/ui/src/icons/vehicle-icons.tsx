import * as React from "react";

export interface VehicleIconProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
}

/**
 * RideIT Professional Transportation Iconography.
 *
 * Each vehicle is crafted for immediate real-world recognizability,
 * mirroring the silhouette clarity of standard transportation emojis:
 * - 🛺 Auto Rickshaw: Canopy roof with front visor, open cabin doorway, front steering fork & rear cabin
 * - 🏍️ Motorcycle: Commuter motorcycle with exposed wheels, fuel tank, stepped seat, engine block & exhaust
 * - 🛵 Scooter / Scooty: Aerodynamic front leg-shield apron, flat step-through floorboard, bulbous rear pod & seat
 * - 🚕 / 🚗 Car / Cab: Sleek modern sedan profile with hood, windshield, side glass pillars, trunk & taxi roofline
 *
 * All icons share:
 * - Standard 48x36 coordinate grid with unified ground baseline (y = 31)
 * - Scalable vector paths optimized from 20px up to 80px
 * - Consistent visual weight, stroke clarity, and contrast on light & dark backgrounds
 */
function makeVehicleIcon(paths: React.ReactNode, displayName: string) {
  const IconComponent = React.forwardRef<SVGSVGElement, VehicleIconProps>(
    ({ size = 24, className, ...props }, ref) => (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 48 36"
        fill="currentColor"
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

/**
 * 🛺 Auto Rickshaw — Iconic Indian 3-wheeler with curved canopy roof,
 * sloped windshield with visor overhang, open side doorway, and passenger bench.
 */
export const AutoIcon = makeVehicleIcon(
  <g>
    {/* Main Auto Body Shell: Canopy, Visor, Cabin & Rear Enclosure */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.5 7.5 C11 7.5 9.5 8.5 8.5 10 L6.5 13 C5.8 14.2 5.8 15.5 6.2 16.8 L7.8 20.5 C8.2 21.6 9 22.4 10.2 22.7 L10.2 24 C10.2 25.2 11 26 12.2 26 L15 26 L15 24 L22 24 L22 26 L29.5 26 C29.8 24.2 31.4 22.8 33.5 22.8 C35.6 22.8 37.2 24.2 37.5 26 L41 26 C42.2 26 43 25 43 23.8 L43 17 C43 11.5 39.5 7.5 33.5 7.5 L12.5 7.5 Z M10.8 10.5 L18 10.5 L17 16.5 L9 16.5 L10.8 10.5 Z M19.8 10.5 L31.5 10.5 L31.5 22 L18.5 22 L18.8 17.5 L19.8 10.5 Z M33.5 10.5 L34.5 10.5 C37.8 10.5 39.8 13 40.2 16.2 L40.2 17.8 L33.5 17.8 L33.5 10.5 Z"
    />
    {/* Driver Handlebar / Steering Column */}
    <path
      d="M12 23 L15.5 18 M14 17.5 L16.5 18"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Front Wheel */}
    <circle cx="10" cy="27" r="4.5" />
    <circle cx="10" cy="27" r="1.8" fill="var(--surface, #ffffff)" />
    {/* Rear Wheel */}
    <circle cx="33.5" cy="27" r="4.5" />
    <circle cx="33.5" cy="27" r="1.8" fill="var(--surface, #ffffff)" />
    {/* Front Mudguard & Headlight */}
    <path d="M6 24 C6 21.5 8 19.8 10.5 19.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    <circle cx="6.5" cy="18" r="1.2" />
  </g>,
  "AutoIcon"
);

/**
 * 🏍️ Motorcycle — Commuter motorcycle with exposed wheels,
 * angled front fork, sculpted fuel tank, stepped seat, engine block & exhaust.
 */
export const BikeIcon = makeVehicleIcon(
  <g>
    {/* Front Fork & Handlebars */}
    <path
      d="M9.5 26.5 L16.5 9.5 M14 9 L18 10 M12.5 12 L15.5 13"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Sculpted Fuel Tank */}
    <path
      d="M17 11.5 C19 8.5 24 8.5 27.5 11.5 C29 13 29 15.5 27.5 16.5 L18 15.5 Z"
    />
    {/* Stepped Two-Tier Commuter Seat */}
    <path
      d="M26.5 14.5 C28.5 13.5 32 13 36 13 C38.5 13 41.5 14 43 15.5 L43 18 C39.5 18 34 18 26.5 17 Z"
    />
    {/* Mechanical Engine Block */}
    <path
      d="M19 17.5 L27 17.5 L26.5 24.5 L18.5 24.5 Z"
    />
    <line x1="20" y1="20" x2="25.5" y2="20" stroke="var(--surface, #ffffff)" strokeWidth="1.2" />
    <line x1="20" y1="22.5" x2="25.5" y2="22.5" stroke="var(--surface, #ffffff)" strokeWidth="1.2" />
    {/* Long Chrome Exhaust Pipe */}
    <path
      d="M26 23.5 L42.5 25 C43.5 25 44 25.6 44 26.2 C44 27 43.2 27.5 42.2 27.2 L26 25 Z"
    />
    {/* Front Mudguard & Rear Swingarm */}
    <path d="M5.5 23.5 C6.5 19.5 10.5 19.5 13.5 21.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    <path d="M26 22 L38.5 26.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    {/* Wheels */}
    <circle cx="9.5" cy="26.5" r="5" />
    <circle cx="9.5" cy="26.5" r="2.2" fill="var(--surface, #ffffff)" />
    <circle cx="38.5" cy="26.5" r="5" />
    <circle cx="38.5" cy="26.5" r="2.2" fill="var(--surface, #ffffff)" />
  </g>,
  "BikeIcon"
);

/**
 * 🛵 Scooter / Scooty — Distinct step-through scooter with curved front leg-shield
 * apron, flat floorboard, contoured seat, and bulbous rear body.
 */
export const ScootyIcon = makeVehicleIcon(
  <g>
    {/* Handlebar & Headlight Cowl */}
    <path
      d="M14.5 8 L17.5 8.5 M16 8.5 L17 11.5"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    />
    {/* Curved Front Leg-Shield (Apron) */}
    <path
      d="M16.5 9.5 C15 13.5 11 16.5 10 19.5 C9.5 21.5 10.5 23.5 12 24.5 L15 24.5 L14 18.5 C15.2 15.5 17.5 12.5 18.5 9.5 Z"
    />
    {/* Front Mudguard */}
    <path d="M6 24 C7 20.5 10.5 20.5 12.5 22.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    {/* Low Step-Through Floorboard */}
    <rect x="13.5" y="22.5" width="10.5" height="2.5" rx="1" />
    {/* Bulbous Enclosed Rear Scooter Body */}
    <path
      d="M23.5 23 C24 17.5 26.5 14.5 30.5 14.5 C35.5 14.5 40.5 16.8 42 20.5 C42.5 22 42.5 23.8 41.5 25 L38.5 25 C38 22.8 35.5 21.2 32.5 21.2 C29.5 21.2 27.2 22.8 26.8 24.5 L23.5 23 Z"
    />
    {/* Contoured Scooter Saddle */}
    <path
      d="M23 15 C24 13.2 28.5 13.2 34.5 13.2 C36.5 13.2 37.5 13.8 38 14.8 L23 15 Z"
    />
    {/* Rear Metallic Grab Handle */}
    <path
      d="M36.5 12.5 C38.5 11.5 40.5 12.2 41.5 13.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
    {/* Wheels */}
    <circle cx="9.5" cy="26.5" r="4.5" />
    <circle cx="9.5" cy="26.5" r="1.8" fill="var(--surface, #ffffff)" />
    <circle cx="36.5" cy="26.5" r="4.5" />
    <circle cx="36.5" cy="26.5" r="1.8" fill="var(--surface, #ffffff)" />
  </g>,
  "ScootyIcon"
);

/**
 * 🚕 / 🚗 Car / Cab — Modern aerodynamic sedan with 4-wheel stance,
 * sloped windshield, side window pillars, defined trunk, and taxi roofline.
 */
export const CarIcon = makeVehicleIcon(
  <g>
    {/* Aerodynamic Sedan Body Shell with Wheel Wells */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 23.5 L3 20.5 C3 19.5 3.8 19 5.5 19 L13 19 L18 9.5 C19.2 8 21.5 7.5 24 7.5 L31 7.5 C33.5 7.5 35.2 8.5 36.8 10.5 L40.5 17 L44 17.5 C45.5 18 46.5 19.2 46.5 20.8 L46.5 23.5 C46.5 24.8 45.5 25.8 44.2 25.8 L40.5 25.8 C40.2 23.8 38.5 22.2 36 22.2 C33.5 22.2 31.8 23.8 31.5 25.8 L16.5 25.8 C16.2 23.8 14.5 22.2 12 22.2 C9.5 22.2 7.8 23.8 7.5 25.8 L4.8 25.8 C3.8 25.8 3 24.8 3 23.5 Z M14.5 16.5 L18.5 10.2 L25 10.2 L25 16.5 L14.5 16.5 Z M26.8 10.2 L31 10.2 L35.5 16.5 L26.8 16.5 L26.8 10.2 Z"
    />
    {/* Taxi / Cab Roof Sign Indicator */}
    <path
      d="M22.5 6 L27.5 6 L26.5 7.5 L23.5 7.5 Z"
    />
    {/* Headlight & Taillight accents */}
    <path d="M4 19.5 L6.5 19.5" stroke="var(--surface, #ffffff)" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M44.5 18.5 L46 18.5" stroke="var(--surface, #ffffff)" strokeWidth="1.2" strokeLinecap="round" />
    {/* Wheels */}
    <circle cx="12" cy="26.5" r="4.8" />
    <circle cx="12" cy="26.5" r="2" fill="var(--surface, #ffffff)" />
    <circle cx="36" cy="26.5" r="4.8" />
    <circle cx="36" cy="26.5" r="2" fill="var(--surface, #ffffff)" />
  </g>,
  "CarIcon"
);

export type VehicleKind = "auto" | "bike" | "scooty" | "car";

export const VEHICLE_VISUALS: Record<
  VehicleKind,
  { icon: typeof AutoIcon; label: string; sublabel: string; capacity: string; colorVar: string; textVar: string; tintVar: string }
> = {
  auto: { icon: AutoIcon, label: "Auto", sublabel: "Auto Rickshaw", capacity: "3 seats", colorVar: "var(--marigold)", textVar: "var(--marigold-text)", tintVar: "var(--tint-marigold)" },
  bike: { icon: BikeIcon, label: "Bike", sublabel: "Motorcycle", capacity: "1 seat", colorVar: "var(--violet)", textVar: "var(--violet-text)", tintVar: "var(--tint-violet)" },
  scooty: { icon: ScootyIcon, label: "Scooty", sublabel: "Scooter", capacity: "1 seat", colorVar: "var(--rose)", textVar: "var(--rose-text)", tintVar: "#fdeaf1" },
  car: { icon: CarIcon, label: "Car", sublabel: "Sedan / Cab", capacity: "4 seats", colorVar: "var(--cyan)", textVar: "var(--cyan-text)", tintVar: "var(--tint-blue)" },
};
