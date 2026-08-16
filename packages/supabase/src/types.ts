/**
 * Placeholder for Supabase's generated database types.
 *
 * Once a schema exists, regenerate this with:
 *   supabase gen types typescript --project-id <ref> > packages/supabase/src/types.ts
 *
 * Keeping it as an empty-but-typed shape (rather than `any`) means the
 * client/server/db helpers below are already correctly typed against
 * `Database` and nothing needs to change when the real generated file
 * replaces this one — only this file gets overwritten.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
