# Marketplace safety & moderation

Community games carry user-authored names and descriptions. SAFE applies
defense-in-depth so unsafe or test content never appears as a normal
public listing, and never renders as markup.

## Layers

1. **Write-time moderation (server).** `generate_game` runs
   `qualityCheck()` (`supabase/functions/_shared/sanitize.ts`) on the
   title + prompt before a game is created: it rejects instruction
   injection, symbol-only / mashed-key garbage, and too-short spam. This
   is the primary gate.
2. **Display-time filtering (client).** `src/game/listingSafety.ts`
   (`isDisplayableListing`) re-checks every listing before it is shown in
   the Marketplace and the defense picker's Community tab. Even if an
   unsafe row slipped through earlier (e.g. the historical "Inject"
   listing whose description was a raw prompt-injection string), it is
   hidden. **Calibration success alone can never make a listing visible.**
3. **Text sanitization.** All displayed user text passes through
   `sanitizeUserText()` (`src/utils/sanitize.ts`): angle-bracket HTML is
   stripped, control / zero-width / bidi characters removed, whitespace
   collapsed, and length-capped. React also escapes text nodes.

## What is hidden

`checkListingSafety(name, description)` flags a listing when it:

- is empty / has no letters (`empty`, `garbage`), or
- reads as an instruction hijack ("ignore previous instructions",
  "system prompt", "you are now", "return {json"), matches the specific
  "Inject" payload shape (`{"gridSize": …`), or contains code fences /
  destructive fragments (```` ``` ````, `<script`, `rm -rf`, `DROP TABLE`)
  → (`injection`).

Fail-safe: on any doubt the listing is hidden, not shown.

## Production data cleanup (reviewable, NOT executed here)

The client filter hides the historical `Inject` row immediately, so no
player sees it. To also remove/quarantine it at the source, a reviewer
should run the following against the production database
(`cqacfzkyxmtmjzpksznj`) **after review** — this project does **not**
execute production-data mutations automatically.

Preview the offending rows first (read-only):

```sql
select id, name, left(description, 120) as description, status, created_at
from custom_games
where status = 'live'
  and (
    name ~* '^\\s*inject\\s*$'
    or description ~* 'ignore\\s+(all\\s+)?(the\\s+)?(previous|prior|above)'
    or description ~* '\\{\\s*"?gridsize'
    or description ~* '```|<\\s*script|rm\\s+-rf|drop\\s+table'
  );
```

Quarantine (preferred — reversible, keeps the row for audit):

```sql
-- Review the SELECT above, confirm the id(s), then:
update custom_games
set status = 'rejected',
    calibration_stats = coalesce(calibration_stats, '{}'::jsonb)
      || jsonb_build_object('quarantine', jsonb_build_object(
           'reason', 'injection', 'at', now(), 'by', 'manual-review'))
where id in ('<REVIEWED_ID>');   -- do NOT run with a broad predicate unattended
```

Notes:
- A quarantined (`status <> 'live'`) row is excluded from
  `public_custom_games`, so it disappears from the marketplace at the
  source as well.
- Do not `delete` — quarantine preserves an audit trail.
- Never run a mutation with only the pattern predicate unattended;
  confirm specific ids from the SELECT to avoid catching false positives.
