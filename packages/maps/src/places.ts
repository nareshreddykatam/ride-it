"use client";

import { loadGoogleMapsPlaces } from "./loader";
import { isGoogleMapsConfigured } from "./env";

/**
 * Real Google Places Autocomplete (search-as-you-type). Uses
 * AutocompleteSuggestion.fetchAutocompleteSuggestions() +
 * PlacePrediction.toPlace().fetchFields() — the current, non-deprecated
 * Places API surface (google.maps.places.AutocompleteService, the older
 * class most tutorials still reference, was cut off to new customers
 * March 2025 per its own @deprecated tag). Verified directly against the
 * installed @types/google.maps@3.65.5 definitions in this session, not
 * recalled from training data — the same discipline loader.ts's own
 * comment documents for its Loader-vs-importLibrary choice.
 *
 * Session-token based (createAutocompleteSessionToken/searchPlaces share
 * one token per search session, per Google's own billing guidance —
 * "generate a fresh token for each session, reuse it across every
 * keystroke of that session, and let the first fetchFields() call after a
 * selection close it out").
 */

export interface PlaceSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  /** Kept only to resolve full details on selection (toPlace().fetchFields()) — never serialized/persisted. */
  prediction: google.maps.places.PlacePrediction;
}

export interface PlaceDetails {
  placeId: string;
  lat: number;
  lng: number;
  formattedAddress: string;
}

// Vijayawada, Andhra Pradesh — the operating/demo city (Part 15), mirrors
// RideMap.tsx's DEFAULT_CITY_CENTER. Used only to BIAS (not restrict)
// autocomplete results toward the current service area.
const OPERATING_CITY_CENTER = { lat: 16.5062, lng: 80.648 };
const OPERATING_CITY_BIAS_RADIUS_METERS = 50_000;

export async function createAutocompleteSessionToken(): Promise<google.maps.places.AutocompleteSessionToken | null> {
  if (!isGoogleMapsConfigured()) return null;
  try {
    const places = await loadGoogleMapsPlaces();
    return new places.AutocompleteSessionToken();
  } catch {
    return null;
  }
}

/**
 * Returns [] (never throws) when Maps isn't configured, the input is
 * blank, or the request fails — callers render an honest empty/fallback
 * state rather than crashing the search screen. Callers are responsible
 * for debouncing (see search/page.tsx) — this function makes exactly one
 * request per call, no internal rate-limiting, matching the same
 * "throttling is a call-site concern" split already used by
 * server/eta.ts.
 */
export async function searchPlaces(
  input: string,
  sessionToken: google.maps.places.AutocompleteSessionToken | null
): Promise<PlaceSuggestion[]> {
  const trimmed = input.trim();
  if (!trimmed || !isGoogleMapsConfigured()) return [];

  try {
    const places = await loadGoogleMapsPlaces();
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: trimmed,
      includedRegionCodes: ["in"],
      locationBias: { center: OPERATING_CITY_CENTER, radius: OPERATING_CITY_BIAS_RADIUS_METERS },
      ...(sessionToken ? { sessionToken } : {}),
    });

    const results: PlaceSuggestion[] = [];
    for (const s of suggestions) {
      const prediction = s.placePrediction;
      if (!prediction) continue;
      results.push({
        placeId: prediction.placeId,
        primaryText: (prediction.mainText ?? prediction.text).text,
        secondaryText: prediction.secondaryText?.text ?? "",
        prediction,
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Resolves a selected suggestion to real coordinates + formatted address
 * via Place.fetchFields() — the session-token-bearing call that closes
 * out the autocomplete session (see module comment). Returns null (never
 * throws) on failure; callers fall back to geocoding the raw text instead
 * (see @ride-it/maps/server/geocoding, used identically for this purpose
 * elsewhere in the booking flow already).
 */
export async function resolvePlaceDetails(suggestion: PlaceSuggestion): Promise<PlaceDetails | null> {
  try {
    const place = suggestion.prediction.toPlace();
    const { place: detailed } = await place.fetchFields({ fields: ["location", "formattedAddress"] });
    const loc = detailed.location;
    if (!loc) return null;
    return {
      placeId: suggestion.placeId,
      lat: loc.lat(),
      lng: loc.lng(),
      formattedAddress: detailed.formattedAddress ?? suggestion.primaryText,
    };
  } catch {
    return null;
  }
}
