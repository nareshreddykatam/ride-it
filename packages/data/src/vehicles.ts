import type { SupabaseClient } from "@supabase/supabase-js";
import type { VehicleTypeRow } from "./types";

export interface VehicleRow {
  id: string;
  driver_id: string;
  vehicle_type: VehicleTypeRow;
  registration_number: string;
  make: string | null;
  model: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
}

const VEHICLE_COLUMNS = "id, driver_id, vehicle_type, registration_number, make, model, color, is_active, created_at";

/** The driver's current active vehicle (public.vehicles enforces at most one active row per driver via a partial unique index). */
export async function getActiveVehicle(supabase: SupabaseClient, driverId: string): Promise<VehicleRow | null> {
  const { data, error } = await supabase
    .from("vehicles")
    .select(VEHICLE_COLUMNS)
    .eq("driver_id", driverId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as VehicleRow | null;
}

export interface UpsertVehicleInput {
  driverId: string;
  vehicleType: VehicleTypeRow;
  registrationNumber: string;
  make?: string;
  model?: string;
  color?: string;
}

/**
 * Onboarding's "vehicle information" step. Deactivates any existing
 * active vehicle for this driver first (the partial unique index only
 * allows one is_active=true row per driver, same pattern as
 * driver_documents' "retire then insert" for a replacement), then inserts
 * the new one. Also mirrors vehicle_type onto drivers.vehicle_type — that
 * column (not this table) is what matching actually reads
 * (_find_eligible_drivers joins on d.vehicle_type = r.vehicle_type), and
 * protect_driver_system_columns() already leaves vehicle_type
 * driver-editable, so this is a plain, RLS-governed client write, not an
 * RPC.
 */
export async function upsertActiveVehicle(supabase: SupabaseClient, input: UpsertVehicleInput): Promise<VehicleRow> {
  // registration_number is UNIQUE across the whole table (not just per
  // driver) — a driver resubmitting the same plate must UPDATE their
  // existing row, not insert a duplicate that would violate the
  // constraint. Only deactivate other (different-plate) rows for this
  // driver, since the partial unique index only allows one is_active=true
  // row per driver at a time.
  const { data: existing, error: existingError } = await supabase
    .from("vehicles")
    .select("id")
    .eq("driver_id", input.driverId)
    .eq("registration_number", input.registrationNumber)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) throw existingError;

  const { error: deactivateError } = await supabase
    .from("vehicles")
    .update({ is_active: false })
    .eq("driver_id", input.driverId)
    .eq("is_active", true)
    .neq("id", existing?.id ?? "00000000-0000-0000-0000-000000000000");
  if (deactivateError) throw deactivateError;

  const upsertData = {
    driver_id: input.driverId,
    vehicle_type: input.vehicleType,
    registration_number: input.registrationNumber,
    make: input.make ?? null,
    model: input.model ?? null,
    color: input.color ?? null,
    is_active: true,
  };

  const { data, error } = existing
    ? await supabase.from("vehicles").update(upsertData).eq("id", existing.id).select(VEHICLE_COLUMNS).single()
    : await supabase.from("vehicles").insert(upsertData).select(VEHICLE_COLUMNS).single();
  if (error) throw error;

  const { error: driverError } = await supabase
    .from("drivers")
    .update({ vehicle_type: input.vehicleType })
    .eq("id", input.driverId);
  if (driverError) throw driverError;

  return data as unknown as VehicleRow;
}
