#!/usr/bin/env bash
# Run on the existing Docs host, after transferring the verified archive.
# Usage: sudo bash activate-docs-release.sh RELEASE ARCHIVE SHA256
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root'; exit 1; }
release=${1:?release label required}
archive=${2:?archive path required}
expected=${3:?sha256 required}
[[ $release =~ ^[0-9]{8}T[0-9]{6}Z-handoff$ ]] || exit 2
[[ $archive == /tmp/opendesign-docs-"$release".tar.gz ]] || exit 2
[[ $expected =~ ^[a-f0-9]{64}$ ]] || exit 2
root=/var/www/doc.opendesign.cc
candidate=$root/releases/$release
exec 9>"$root/.release-lock"
flock -n 9 || { echo 'Another Docs release is running'; exit 3; }
[[ -L $root/current ]] || { echo 'Existing current symlink required'; exit 4; }
previous=$(readlink -f "$root/current")
[[ $previous == "$root"/releases/* && -f $previous/index.html ]] || exit 4
[[ ! -e $candidate ]] || { echo 'Candidate already exists; inspect before retry'; exit 5; }
printf '%s  %s\n' "$expected" "$archive" | sha256sum --check --status
# This archive is built from the reviewed dist directory, never a repository or user documents.
mkdir "$candidate"
tar -xzf "$archive" -C "$candidate" --no-same-owner
(cd "$candidate" && sha256sum --check SHA256SUMS)
[[ -f $candidate/index.html && -f $candidate/sdk/opendesign.js ]] || exit 6
# Retain immutable hashed assets for users who still have the old entry loaded.
if [[ -d $previous/assets ]]; then cp -an "$previous/assets/." "$candidate/assets/"; fi
chmod -R a+rX "$candidate"
printf '%s\n' "$previous" > "$candidate/previous-release.txt"
nginx -t
ln -s "$candidate" "$root/current-$release"
mv -Tf "$root/current-$release" "$root/current"
printf 'Activated: %s\nRollback target: %s\n' "$candidate" "$previous"
# No nginx reload, backend restart, CSP edit or browser-data migration needed.
