#!/usr/bin/env bash
# Explicit rollback of the 20260929 Studio release. Preserves all database/state data.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root'; exit 1; }
release=20260929T052906Z-handoff
root=/var/www/doc.opendesign.cc
current=$(readlink -f "$root/current")
[[ $current == "$root/releases/$release" ]] || { echo 'Release changed; inspect before rollback'; exit 2; }
previous=$(cat "$current/previous-release.txt")
[[ $previous == "$root/releases/"* && -f "$previous/index.html" ]] || exit 3
backup=/etc/nginx/sites-available/doc.opendesign.cc.pre-studio-$release
[[ -f $backup ]] || exit 4
[[ $(sha256sum /etc/nginx/sites-available/doc.opendesign.cc | cut -d " " -f 1) == 83df04e340bec1f3701c573ae9688bc49a3399ccfc407ef410128f8ed3730ba1 ]] || { echo "Nginx config changed; merge rollback manually"; exit 4; }
exec 9>"$root/.release-lock"
flock -n 9 || exit 5
# Preserve immutable assets for already-open clients. No original file is replaced.
cp -an "$current/assets/." "$previous/assets/"
cp /etc/nginx/sites-available/doc.opendesign.cc /etc/nginx/sites-available/doc.opendesign.cc.before-studio-rollback
cp "$backup" /etc/nginx/sites-available/doc.opendesign.cc
if ! nginx -t; then
 cp /etc/nginx/sites-available/doc.opendesign.cc.before-studio-rollback /etc/nginx/sites-available/doc.opendesign.cc
 exit 6
fi
ln -s "$previous" "$root/rollback-studio-$release"
mv -Tf "$root/rollback-studio-$release" "$root/current"
systemctl reload nginx
systemctl disable --now opendesign-docs-studio-api opendesign-docs-studio-worker
printf 'Rolled back web/API exposure to %s; database and signing state retained.\n' "$previous"
