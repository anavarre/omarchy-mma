#!/usr/bin/env bash
# bin/mma-paste must cap bytes and time no matter what the clipboard or
# PRIMARY owner does: send too much, never stop sending, or never start.
set -u
S="$(dirname "$0")/../bin/mma-paste"
d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
cat > "$d/wl-paste" <<'X'
#!/bin/bash
primary=no; for a in "$@"; do [ "$a" = --primary ] && primary=yes; done
case "$FAKE" in
  big) head -c 100000000 /dev/zero | tr '\0' a;;
  endless) yes aaaaaaaa | tr -d '\n';;
  trickle) while :; do printf a; sleep 0.05; done;;
  silent) sleep 30;;
  exact) head -c 512 /dev/zero | tr '\0' a;;
  utf8) printf 'Ji\xc5\x99\xc3\xad Proch\xc3\xa1zka';;
  ok) printf 'jon jones';;
  which) printf '%s' "$primary";;
  fail) exit 1;;
esac
X
chmod +x "$d/wl-paste"
fail=0
run() { FAKE=$1 PATH="$d:$PATH" bash "$S" "${@:2}"; }
check() { [ "$2" = "$3" ] || { echo "FAIL $1: got '$2', want '$3'"; fail=1; }; }
timed() { # name, expected exit code, fake [primary]
  local start=$SECONDS; run "$3" ${4:-} > /dev/null; local rc=$?
  { [ $rc -eq "$2" ] && [ $((SECONDS - start)) -le 3 ]; } || { echo "FAIL $1: rc=$rc after $((SECONDS - start))s"; fail=1; }
}
check ok "$(run ok)" "jon jones"
check utf8 "$(run utf8)" "$(printf 'Ji\xc5\x99\xc3\xad Proch\xc3\xa1zka')"
check exact "$(run exact | wc -c)" 512
check clipboard "$(run which)" no
check primary "$(run which primary)" yes
timed "oversized" 2 big
timed "endless stream" 2 endless
timed "trickle past deadline" 1 trickle
timed "owner never sends" 1 silent
timed "wl-paste fails" 1 fail
# The same bounds hold for PRIMARY (middle click), a separate selection owner.
timed "primary oversized" 2 big primary
timed "primary endless stream" 2 endless primary
timed "primary trickle past deadline" 1 trickle primary
timed "primary owner never sends" 1 silent primary
run ok bogus > /dev/null; check "bad argument" $? 64
run ok primary extra > /dev/null; check "extra argument" $? 64
[ $fail -eq 0 ] && echo ok
exit $fail
