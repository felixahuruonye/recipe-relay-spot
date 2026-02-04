import type { SupabaseClient } from "@supabase/supabase-js";

type UserLike = {
  id: string;
  email?: string | null;
};

/**
 * Some accounts can exist in auth without a corresponding `user_profiles` row.
 * Many RPCs assume the profile row exists; this helper attempts to create one
 * (id == auth uid) using a deterministic username.
 */
export async function ensureUserProfile(
  supabase: SupabaseClient,
  user: UserLike
): Promise<{ ok: boolean; created?: boolean; error?: unknown }> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    // If we can read it and it exists, done.
    if (data?.id) return { ok: true, created: false };

    // If select failed due to RLS, still attempt upsert (it will succeed/fail accordingly).
    if (error && (error as any)?.code !== "PGRST116") {
      // fall through to upsert
    }

    const username = `user_${user.id.replace(/-/g, "").slice(0, 10)}`;
    const { error: upsertError } = await supabase.from("user_profiles").upsert(
      {
        id: user.id,
        username,
      } as any,
      { onConflict: "id" }
    );

    if (upsertError) return { ok: false, created: false, error: upsertError };
    return { ok: true, created: true };
  } catch (e) {
    return { ok: false, created: false, error: e };
  }
}
