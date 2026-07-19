# SAFE visual state system

SAFE uses a small semantic state vocabulary across vaults, dossiers, the breach rail, outcomes, and activity. Use the shared `VisualState` components and CSS tokens instead of inventing screen-specific badges.

| State | Meaning | Color role | Non-color cues | Typical motion |
| --- | --- | --- | --- | --- |
| `secure` | Defenses are ready and not exposed | Acid lime | Closed circle, shield/lock icon, “Secure” label | Slow dial/scan only |
| `warning` | Attention or preparation is required | Amber | Triangle, alert icon, recommendation text | Brief scan/pulse |
| `exposed` | The player's safe can be attacked | Amber-orange | Open-ring geometry, timer, “Exposed” label | Controlled outer pulse |
| `attacking` | An attack is currently resolving | Red-orange | Target/crosshair icon, lock rail, countdown | Scan and mechanical bolt travel |
| `cracked` | One lock has passed | Acid lime/white | Broken ring, retracted bolt, “Cracked” text | Short retract/impact |
| `failed` | A lock or heist has failed | Red-orange | Closed bolt, failure label, consequence copy | Short slam/pulse |
| `breached` | Every lock passed and the vault opened | White + lime | Fractured border, displaced bolts, open door | One-shot mechanical opening |
| `recovering` | The safe is temporarily restoring defenses | Amber | Repair icon, time/status text | Restrained scan |

## Token rules

- Use matte graphite surfaces and borders for default structure. Glow is an accent, not a background treatment.
- Semantic color must never be the only state signal. Pair it with a word, icon, shape, border pattern, or mechanical position.
- Reserve white flashes for one-shot impact moments. Do not loop them.
- Circular geometry represents secure systems. Triangles and scan lines represent exposure or warning. Broken circles, shifted bolts, and fractured borders represent breaches.
- Use the existing red-orange for active danger and irreversible failure; do not reuse it for neutral destructive-looking controls without a text label.
- Keep body copy at readable contrast on every metal surface. Muted text is secondary, not disabled.

## Interaction rules

- Every interactive target is at least 44 × 44 CSS pixels.
- Icon-only controls require `aria-label` or visible accessible text.
- Focus-visible outlines must be clearly separated from the component border.
- Fixed bottom navigation and sticky action trays must add `env(safe-area-inset-bottom)` and reserve equivalent scroll padding.
- Status announcements that affect the current action use an appropriate live region; decorative SVG and motion layers are hidden from assistive technology.
- Honor `prefers-reduced-motion: reduce` by removing nonessential transforms, scan loops, flashes, and smooth scrolling. State changes must remain understandable when motion is removed.

## Copy rules

Use stable, concrete terms: **stake**, **gross loot**, **platform cut**, and **net payout**. A gross amount must never be called a reward. Progress reads “2 of 3 locks cracked,” not “2/3 passed”; when no locks exist, give a setup instruction instead of “0/0.”
