export type AppRole = "passenger" | "driver" | "admin";

/**
 * The app-facing profile shape — deliberately narrower and friendlier than
 * Supabase's raw `User` object (which carries auth-internal fields no
 * screen needs). Maps 1:1 to the columns selected from public.users in
 * context.tsx's loadProfile().
 */
export interface AuthProfile {
  id: string;
  /** The role this identity originally signed up under. NOT the capability gate for passenger/driver app access — see isPassenger/isDriver. */
  role: AppRole;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  /** Whether a public.passengers row exists for this identity — the real passenger-app capability signal (one Auth identity can be both). */
  isPassenger: boolean;
  /** Whether a public.drivers row exists for this identity — the real driver-app capability signal (one Auth identity can be both). */
  isDriver: boolean;
}
