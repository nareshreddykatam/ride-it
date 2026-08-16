export type AppRole = "passenger" | "driver" | "admin";

/**
 * The app-facing profile shape — deliberately narrower and friendlier than
 * Supabase's raw `User` object (which carries auth-internal fields no
 * screen needs). Maps 1:1 to the columns selected from public.users in
 * context.tsx's loadProfile().
 */
export interface AuthProfile {
  id: string;
  role: AppRole;
  fullName: string | null;
  email: string | null;
  phone: string | null;
}
