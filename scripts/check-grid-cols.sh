#!/usr/bin/env bash
#
# Guard against the mobile horizontal-overflow bug class fixed in
# commits 2948c9d + 8da37b2.
#
# THE BUG: a `grid` container with ONLY a breakpoint-prefixed
# grid-cols (e.g. `grid md:grid-cols-2`) and NO base `grid-cols-N`.
# On mobile the implicit single column uses
# minmax(min-content, max-content); a child with large max-content
# (a flex-wrap pill cloud, a long unbroken email/address, etc.) can
# push the grid wider than the viewport, causing horizontal scroll.
# The fix is always to add an explicit base, e.g. `grid-cols-1`.
#
# MODE: WARNINGS ONLY (always exit 0) until the admin sweep (~48
# remaining violations) lands. Flip `WARN_ONLY=0` below to make CI
# fail on any violation once admin is clean.
#
# NOTE on the regex: the base-detection filter anchors `grid-cols-N`
# on a NON-colon preceding char (`"`, `'`, space, or `{`). A naive
# `\bgrid-cols-[0-9]` would ALSO match `md:grid-cols-2` (a word
# boundary sits right after the colon), masking every real violation.
#
set -uo pipefail

WARN_ONLY=0

# 1) lines with a breakpoint-prefixed grid-cols
# 2) drop lines that ALSO carry an explicit base grid-cols-N / -[..]
# 3) drop intentional carousels (flex + overflow-x-auto scroll-snap
#    rails that only become a grid at a breakpoint)
VIOLATIONS="$(
  grep -rnE --include='*.tsx' --include='*.ts' '(sm|md|lg|xl|2xl):grid-cols-' src/ \
    | grep -vE "[\"' {]grid-cols-[0-9[]" \
    | grep -vE 'flex.*overflow-x-auto|overflow-x-auto.*flex' \
    || true
)"

if [ -z "$VIOLATIONS" ]; then
  echo "✅ No breakpoint-only grid-cols violations found."
  exit 0
fi

COUNT="$(printf '%s\n' "$VIOLATIONS" | wc -l | tr -d ' ')"

echo "⚠️  Found ${COUNT} grid container(s) with a breakpoint-only grid-cols (no explicit base):"
echo ""
printf '%s\n' "$VIOLATIONS"
echo ""
echo "Fix: prepend an explicit base column count to the className, e.g.:"
echo "       grid md:grid-cols-2   ->   grid grid-cols-1 md:grid-cols-2"
echo "Context: commits 2948c9d + 8da37b2 (grid-cols mobile-overflow sweep)."

if [ "$WARN_ONLY" -eq 1 ]; then
  echo ""
  echo "(warning only — admin sweep pending. Set WARN_ONLY=0 to enforce.)"
  exit 0
fi

exit 1
