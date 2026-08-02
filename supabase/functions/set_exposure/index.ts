// POST /functions/v1/set_exposure
//
// The ONLY writer of safes.exposed_until. Entering heist mode opens the
// window; exiting closes it.
//
// The client never supplies a duration — the window length is derived
// here from ECONOMY.heistDuration, so a tampered client cannot grant
// itself a shorter exposure (less risk for the same raiding rights) or
// a longer one.
//
// EXIT CLOSES THE DOOR, IT DOES NOT CANCEL. Clearing exposed_until stops
// NEW attacks starting. Attacks already in flight keep their pending
// status and settle normally through submit_result — once a stake is
// committed the contest resolves, win or lose. The response reports how
// many raids are still underway so the UI can say so plainly rather
// than implying the player is now safe.
//
// Body: { exposed: boolean }

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import {
  errorResponse,
  getUserId,
  handleCors,
  jsonResponse,
  serviceClient,
} from '../_shared/http.ts';
import { ECONOMY } from '../_shared/constants.ts';

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('unauthorized', 401);

  let body: { exposed?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return errorResponse('bad_json');
  }
  if (typeof body.exposed !== 'boolean') return errorResponse('bad_body', 400, { expected: 'exposed:boolean' });

  const supabase = serviceClient();

  const { data: safe, error: safeErr } = await supabase
    .from('safes')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle();
  if (safeErr || !safe) return errorResponse('safe_not_found', 404);

  // Server-derived window. Never from the request body.
  const exposedUntil = body.exposed
    ? new Date(Date.now() + ECONOMY.heistDuration * 1000).toISOString()
    : null;

  const { error: updateErr } = await supabase
    .from('safes')
    .update({ exposed_until: exposedUntil })
    .eq('id', safe.id);
  if (updateErr) return errorResponse('exposure_update_failed', 500, { detail: updateErr.message });

  // Raids already underway are untouched by exiting — count them so the
  // client can be honest about what is still going to play out.
  const { count: inFlight } = await supabase
    .from('attacks')
    .select('id', { count: 'exact', head: true })
    .eq('defender_safe_id', safe.id)
    .eq('status', 'pending');

  return jsonResponse({
    exposedUntil,
    exposed: Boolean(exposedUntil),
    /** Attacks against this safe that keep running regardless. */
    inFlightAttacks: inFlight ?? 0,
  });
});
