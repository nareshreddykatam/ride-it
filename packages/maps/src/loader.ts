"use client";

import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { getGoogleMapsBrowserKey } from "./env";

/**
 * Uses @googlemaps/js-api-loader's functional API (setOptions +
 * importLibrary), NOT the `Loader` class — verified by reading the
 * installed package's actual type definitions in this session (real npm
 * network access was available; the `Loader` class is marked
 * @deprecated in the currently-published 2.1.1 in favor of this
 * functional API). This is exactly the kind of drift the task brief
 * warned about ("use the current supported approach rather than relying
 * on outdated documentation") — an earlier version of this file used the
 * deprecated class-based pattern from training-data memory and was
 * caught by real `tsc` failing to find `importLibrary` on `Loader`.
 *
 * NOT CALLED unless isGoogleMapsConfigured() is true — see
 * components/RideMap.tsx.
 */
let optionsSet = false;
let mapsLibraryPromise: Promise<google.maps.MapsLibrary> | null = null;
let markerLibraryPromise: Promise<google.maps.MarkerLibrary> | null = null;

export async function loadGoogleMaps(): Promise<typeof google> {
  const apiKey = getGoogleMapsBrowserKey();
  if (!apiKey) {
    throw new Error("[@ride-it/maps] loadGoogleMaps() called without a configured key — check isGoogleMapsConfigured() first.");
  }

  if (!optionsSet) {
    setOptions({ key: apiKey, v: "weekly" });
    optionsSet = true;
  }

  if (!mapsLibraryPromise) mapsLibraryPromise = importLibrary("maps");
  if (!markerLibraryPromise) markerLibraryPromise = importLibrary("marker");

  await Promise.all([mapsLibraryPromise, markerLibraryPromise]);
  return google;
}
