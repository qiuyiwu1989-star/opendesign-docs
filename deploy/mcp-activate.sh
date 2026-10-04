#!/usr/bin/env bash
set -euo pipefail
[[ $EUID = 0 ]]
archive=/tmp/opendesign-mcp-20260918.tar.gz
expected=e45300d8763d8e3b8d557829d8590bad0757ee1415aaddee420ae08608790633
echo "$expected  $archive" | sha256sum -c -
release=/opt/opendesign-handoff/releases/20260918-pilot-r2
[[ ! -e "$release" ]]
install -d "$release"
tar --no-same-owner -xzf "$archive" -C "$release"
chmod -R a+rX "$release"
ln -s "$release" /opt/opendesign-handoff/current.next
mv -Tf /opt/opendesign-handoff/current.next /opt/opendesign-handoff/current
install -m 644 /tmp/opendesign-handoff.service /etc/systemd/system/opendesign-handoff.service
systemctl daemon-reload
systemctl enable --now opendesign-handoff.service
curl --retry 5 --retry-connrefused --retry-delay 1 -fsS -H 'Host: doc.opendesign.cc' http://127.0.0.1:5192/connect/healthz
backup=/etc/nginx/sites-available/doc.opendesign.cc.pre-mcp-20260918
cp /etc/nginx/sites-available/doc.opendesign.cc "$backup"
install -m 644 /tmp/mcp.nginx.conf /etc/nginx/conf.d/opendesign-mcp.conf
install -m 644 /tmp/mcp-location.conf /etc/nginx/snippets/opendesign-mcp-location.conf
python3 - <<'PYCODE'
from pathlib import Path
p=Path('/etc/nginx/sites-available/doc.opendesign.cc')
s=p.read_text()
assert 'opendesign-mcp-location' not in s
anchor='    location = /healthz'
assert s.count(anchor)==1
p.write_text(s.replace(anchor, '    include /etc/nginx/snippets/opendesign-mcp-location.conf;\n\n'+anchor))
PYCODE
if nginx -t; then systemctl reload nginx; else cp "$backup" /etc/nginx/sites-available/doc.opendesign.cc; exit 1; fi
systemctl is-active opendesign-handoff.service
date --iso-8601=seconds
