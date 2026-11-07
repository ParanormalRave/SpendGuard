#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IDL_SRC="$ROOT/contracts/target/idl/spendguard.json"
TYPES_SRC="$ROOT/contracts/target/types/spendguard.ts"

if [[ ! -f "$IDL_SRC" ]]; then
  echo "IDL not found at $IDL_SRC. Run 'anchor build' first." >&2
  exit 1
fi

for dest in "$ROOT/backend/src/idl" "$ROOT/frontend/src/idl"; do
  mkdir -p "$dest"
  cp "$IDL_SRC" "$dest/spendguard.json"
  if [[ -f "$TYPES_SRC" ]]; then
    cp "$TYPES_SRC" "$dest/spendguard.ts"
  fi
  echo "Synced IDL to $dest"
done
