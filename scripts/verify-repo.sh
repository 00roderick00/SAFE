#!/usr/bin/env bash
# verify-repo.sh — confirm you are in the CORRECT SAFE repository before
# building, testing, or deploying.
#
# The rebuilt, production app is the NESTED repo at  ~/SAFE/SAFE  on the
# `codex-rebuild` branch (which is also merged into `main`). The PARENT
# ~/SAFE holds an OLDER build that must never be deployed as SAFE.
#
# This script is read-only and non-destructive. It exits non-zero (and
# prints why) if it does not detect the rebuilt app, so it is safe to
# wire into a predeploy step, e.g.  npm run verify-repo && vercel --prod
set -euo pipefail

fail() { printf '\033[31mx WRONG REPO: %s\033[0m\n' "$1" >&2; exit 1; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$1"; }

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$root" ] || fail "not inside a git working tree."

# The rebuilt app carries these markers; the older parent build does not.
markers=(
  "vercel.json"
  "src/components/game/BreachHud.tsx"
  "src/game/gameNaming.ts"
  "supabase/functions/_shared/verify.ts"
)
missing=()
for m in "${markers[@]}"; do
  [ -e "$root/$m" ] || missing+=("$m")
done
if [ "${#missing[@]}" -gt 0 ]; then
  fail "this git root ($root) is missing rebuilt-app markers: ${missing[*]}.
       You are probably in the obsolete parent repo (~/SAFE). The correct
       app is the nested ~/SAFE/SAFE on branch codex-rebuild."
fi

# Nested-path sanity: expect .../SAFE/SAFE (parent dir also named SAFE).
base="$(basename "$root")"
parent="$(basename "$(dirname "$root")")"
if [ "$base" != "SAFE" ] || [ "$parent" != "SAFE" ]; then
  printf '\033[33m! note: repo path is %s (expected .../SAFE/SAFE). Markers OK, continuing.\033[0m\n' "$root" >&2
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
ok "Rebuilt SAFE app detected."
ok "Repo root : $root"
ok "Branch    : $branch  (expected: codex-rebuild or main)"
if [ "$branch" != "codex-rebuild" ] && [ "$branch" != "main" ]; then
  printf '\033[33m! branch is "%s" — production source is main (fast-forwarded from codex-rebuild).\033[0m\n' "$branch" >&2
fi
