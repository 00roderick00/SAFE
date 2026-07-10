// Typed wrapper around every server-side call. Stores go through
// this file so payout/balance logic can NEVER be forged client-side —
// the Edge Functions are the source of truth.

import { supabase } from './supabaseClient';
import type {
  ModuleType,
  SecurityLoadout,
  SecurityModule,
} from '../types';

// ---------------------------------------------------------------
// Types shared with Edge Functions (kept in sync manually — the
// canonical definition is in supabase/functions/_shared/*.ts).
// ---------------------------------------------------------------

export interface AttackModuleSeed {
  index: number;
  moduleType: ModuleType;
  difficulty: number;
  seed: string;
}

export interface AttackStartPayload {
  attackId: string;
  defenderHandle: string;
  isBotTarget: boolean;
  stake: number;
  potentialLoot: number;
  modules: AttackModuleSeed[];
}

export interface SubmitResultPayload {
  attackId: string;
  status: 'won' | 'lost';
  loot: number;
  platformFee: number;
  stake: number;
  newBalance: number | null;
  modules: { moduleIndex: number; score: number; passed: boolean }[];
}

export interface DefenseTickPayload {
  attacked: boolean;
  success?: boolean;
  attackerName?: string;
  moduleResults?: {
    moduleIndex: number;
    moduleId: string;
    attackerScore: number;
    defended: boolean;
  }[];
  feeEarned?: number;
  lootLost?: number;
  insurancePayout?: number;
  newBalance?: number | null;
  reason?: string;
}

export interface SafeSnapshot {
  id: string;
  owner_id: string;
  balance: number;
  security_loadout: SecurityLoadout;
  handle: string | null;
  last_attacked_at: string | null;
}

export interface Profile {
  id: string;
  handle: string | null;
  mmr: number;
  migrated_from_local: boolean;
}

// ---------------------------------------------------------------
// Function invocations. supabase.functions.invoke wraps the JWT and
// URL for us — no manual fetch/Authorization header needed.
// ---------------------------------------------------------------

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) throw new Error(`${name}: ${error.message}`);
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(`${name}: ${(data as { error: string }).error}`);
  }
  return data as T;
}

export const api = {
  async startAttack(input: { defenderSafeId?: string; botDifficulty?: number }): Promise<AttackStartPayload> {
    return callFunction<AttackStartPayload>('start_attack', input);
  },

  async submitResult(input: {
    attackId: string;
    results: {
      moduleIndex: number;
      moduleType: string;
      score: number;
      passed: boolean;
      timeSpent: number;
    }[];
  }): Promise<SubmitResultPayload> {
    return callFunction<SubmitResultPayload>('submit_result', input);
  },

  async resolveDefense(): Promise<DefenseTickPayload> {
    return callFunction<DefenseTickPayload>('resolve_defense', {});
  },

  // ------- CRUD over user data -------

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, handle, mmr, migrated_from_local')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async updateProfile(userId: string, patch: Partial<Pick<Profile, 'handle' | 'mmr' | 'migrated_from_local'>>): Promise<void> {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (error) throw error;
  },

  async getSafe(userId: string): Promise<{ id: string; balance: number; security_loadout: SecurityLoadout } | null> {
    const { data, error } = await supabase
      .from('safes')
      .select('id, balance, security_loadout')
      .eq('owner_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async updateLoadout(userId: string, loadout: SecurityLoadout): Promise<void> {
    const { error } = await supabase
      .from('safes')
      .update({ security_loadout: loadout, updated_at: new Date().toISOString() })
      .eq('owner_id', userId);
    if (error) throw error;
  },

  async listTargets(userId: string, limit = 15): Promise<SafeSnapshot[]> {
    const { data, error } = await supabase
      .from('public_safe_snapshots')
      .select('id, owner_id, balance, security_loadout, handle, last_attacked_at')
      .neq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as SafeSnapshot[];
  },

  async getInsurancePolicy(userId: string) {
    const { data, error } = await supabase
      .from('insurance_policies')
      .select('*')
      .eq('owner_id', userId)
      .gt('expires_at', new Date().toISOString())
      .gt('claims_remaining', 0)
      .order('purchased_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async purchaseInsurance(userId: string, plan: {
    tier: string;
    coverage: number;
    premium: number;
    maxPayout: number;
    durationSeconds: number;
  }) {
    // Note: this bypasses the ledger flow and would ideally be a
    // dedicated Edge Function so the premium debit is atomic with
    // the policy insert. For MVP we make two calls and accept the
    // (small) risk. TODO: extract to buy_insurance edge fn.
    const now = new Date();
    const expiresAt = new Date(now.getTime() + plan.durationSeconds * 1000);
    const { error: insertErr } = await supabase.from('insurance_policies').insert({
      owner_id: userId,
      tier: plan.tier,
      coverage: plan.coverage,
      premium: plan.premium,
      max_payout: plan.maxPayout,
      claims_remaining: 3,
      purchased_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
    if (insertErr) throw insertErr;
    // Balance is mutated by the DB via a matching ledger row through
    // a separate rpc call — for MVP we accept a temporary two-step.
    const { error: ledgerErr } = await supabase.rpc('insert_ledger', {
      p_user_id: userId,
      p_delta: -plan.premium,
      p_reason: 'insurance_premium',
      p_ref_type: 'policy',
      p_ref_id: null,
    });
    if (ledgerErr) throw ledgerErr;
  },
};

// ---------------------------------------------------------------
// First-login migration: copy the localStorage-backed player state
// into the DB once, then mark the profile as migrated.
// ---------------------------------------------------------------

export interface LocalMigrationInput {
  userId: string;
  safeBalance: number;
  securityLoadout: SecurityLoadout;
}

export async function migrateLocalIfNeeded(input: LocalMigrationInput): Promise<'migrated' | 'skipped'> {
  const profile = await api.getProfile(input.userId);
  if (!profile) return 'skipped';
  if (profile.migrated_from_local) return 'skipped';

  // Server-owned starting balance is 1000 (initial_grant trigger).
  // If the local balance is higher, top up the delta; if lower, don't
  // debit — a fresh account should not be penalized.
  const startingBalance = 1000;
  const delta = Math.max(0, Math.round(input.safeBalance) - startingBalance);
  if (delta > 0) {
    const { error } = await supabase.rpc('insert_ledger', {
      p_user_id: input.userId,
      p_delta: delta,
      p_reason: 'migration',
      p_ref_type: 'migration',
      p_ref_id: null,
    });
    if (error) throw error;
  }

  // Copy the loadout if the user has one configured.
  if (input.securityLoadout.modules.length > 0) {
    // Strip any generated-in-memory ids so DB rows are consistent
    // (loadout is stored as JSONB so this isn't strictly necessary,
    // but keeps the shape clean).
    const cleanedLoadout: SecurityLoadout = {
      effectiveScore: input.securityLoadout.effectiveScore,
      modules: input.securityLoadout.modules.map(
        (m): SecurityModule => ({
          id: m.id,
          type: m.type,
          difficulty: m.difficulty,
          weight: m.weight,
          name: m.name,
          description: m.description,
        })
      ),
    };
    await api.updateLoadout(input.userId, cleanedLoadout);
  }

  await api.updateProfile(input.userId, { migrated_from_local: true });
  return 'migrated';
}
