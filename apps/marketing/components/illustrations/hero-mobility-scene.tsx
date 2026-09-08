import { RidoraAutoArt, RidoraCarArt, RidoraScootyArt } from "./vehicles";
import { PhoneMapVisual } from "./phone-map-visual";

/**
 * Layered hero composition: road platform → vehicle cluster (car
 * foreground, auto midground, scooty background, left-to-right so none of
 * the three overlap each other) → phone/map visual floating in its own
 * band above the cluster rather than on top of it. Depth comes from scale
 * + z-order + a shared ground shadow per vehicle, not from stacking random
 * floating 3D objects — every vehicle sits on the same implied ground
 * plane. Floats gently (rd-float, staggered delays); resolves to static
 * under prefers-reduced-motion via theme.css.
 */
export function HeroMobilityScene() {
  return (
    <div className="relative mx-auto aspect-[6/5] w-full max-w-xl sm:aspect-[11/9] lg:aspect-[5/4]">
      {/* Road / platform */}
      <div className="absolute inset-x-[2%] bottom-[16%] h-3 rounded-full bg-rd-navy/10" />
      <div className="absolute inset-x-[6%] bottom-[17%] h-1 rounded-full bg-rd-teal/50" />

      {/* Vehicle cluster — left to right, no overlap */}
      <div className="absolute bottom-[10%] left-[-4%] w-[40%] animate-rd-float-slow" style={{ animationDelay: "0.4s" }}>
        <RidoraCarArt className="w-full" />
      </div>
      <div className="absolute bottom-[13%] left-[32%] w-[28%] animate-rd-float-slow">
        <RidoraAutoArt className="w-full" />
      </div>
      <div className="absolute bottom-[11%] right-[4%] w-[22%] animate-rd-float-slow" style={{ animationDelay: "0.8s" }}>
        <RidoraScootyArt className="w-full" />
      </div>

      {/* Phone / map, floating in its own band above the cluster — kept
          narrow so its natural phone aspect ratio doesn't grow tall enough
          to reach down into the vehicle row below it. */}
      <div className="absolute right-[10%] top-0 w-[30%] animate-rd-float" style={{ animationDelay: "0.2s" }}>
        <PhoneMapVisual className="w-full" />
      </div>
    </div>
  );
}
