#!/usr/bin/env bash
# One-shot kickoff: start a phase from PHASES.md without a question round.
#
#   scripts/kickoff.sh 3          # branch phase 3 off phase 2's branch, open Claude on it
#   scripts/kickoff.sh 3 --print  # just print the prompt
#   scripts/kickoff.sh all        # every phase not yet on origin, in order, headless
#
# Phases stack: each branches off the previous phase's branch (or main for phase 1).
# Headless runs pass $CLAUDE_FLAGS to `claude -p` (e.g. CLAUDE_FLAGS="--permission-mode auto").
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

spec() { awk -v h="## Phase $1:" 'index($0,h)==1{p=1;print;next} /^## /{p=0} p' PHASES.md; }
branch() { spec "$1" | sed -n 's/^Branch: .\(.*\).$/\1/p'; }
last() { grep -c '^## Phase ' PHASES.md; }

prompt() {
  cat <<EOF
/implement Phase $1 of switchyard. The spec below is the agreed /kickoff output: do not ask
clarifying questions unless something is genuinely blocked. Decisions are in SWITCHYARD_PLAN.md.
TDD, commit as you go, then /pr as a draft PR with base \`$2\`.

$(spec "$1")
EOF
}

start() {
  local n=$1 mode=${2:-} b base
  b=$(branch "$n")
  [ -n "$b" ] || { echo "no Phase $n in PHASES.md" >&2; exit 1; }
  base=main
  [ "$n" -gt 1 ] && base=$(branch $((n - 1)))
  if [ "$mode" = --print ]; then prompt "$n" "$base"; return; fi

  git fetch -q origin
  git rev-parse -q --verify "origin/$base" >/dev/null || { echo "base $base is not on origin" >&2; exit 1; }
  if git rev-parse -q --verify "$b" >/dev/null; then git checkout -q "$b"; else git checkout -q -b "$b" "origin/$base"; fi

  local flags=()
  read -ra flags <<<"${CLAUDE_FLAGS:-}"
  if [ "$mode" = --headless ]; then claude -p ${flags[@]+"${flags[@]}"} "$(prompt "$n" "$base")"; else claude "$(prompt "$n" "$base")"; fi
}

[ $# -ge 1 ] || { sed -n '2,10p' "$0"; exit 1; }
if [ "$1" = all ]; then
  for n in $(seq 1 "$(last)"); do
    git ls-remote -q --exit-code --heads origin "$(branch "$n")" >/dev/null && continue
    start "$n" --headless
    git ls-remote -q --exit-code --heads origin "$(branch "$n")" >/dev/null ||
      { echo "Phase $n did not push its branch; stopping." >&2; exit 1; }
  done
else
  start "$1" "${2:-}"
fi
