#!/bin/sh
# Runs inside the PVE container: deploys the editor and drives the same API calls as the UI.
set -eu

APP=/opt/pve-cloudinit-editor
BASE=https://localhost:8006
NODE=$(hostname)
STORAGE=local
VMID=9000
SNIPPET=e2e-user.yaml
CONTENT='#cloud-config
hostname: e2e
packages:
  - curl'

step() { echo "==> $*"; }
fail() {
    echo "FAIL: $*" >&2
    exit 1
}

wait_for_api() {
    for _ in $(seq 150); do
        if curl -ksf -o /dev/null --data-urlencode username=root@pam --data-urlencode password=root \
            "$BASE/api2/json/access/ticket"; then
            return
        fi
        sleep 2
    done
    fail "PVE API did not become ready"
}

login() {
    auth=$(curl -ksSf --data-urlencode username=root@pam --data-urlencode password=root \
        "$BASE/api2/json/access/ticket")
    TICKET=$(echo "$auth" | jq -r .data.ticket)
    CSRF=$(echo "$auth" | jq -r .data.CSRFPreventionToken)
}

api() {
    method=$1
    path=$2
    shift 2
    curl -ksS --fail-with-body -X "$method" -b "PVEAuthCookie=$TICKET" \
        -H "CSRFPreventionToken: $CSRF" "$@" "$BASE/api2/json$path"
}

step "Waiting for PVE"
wait_for_api

step "Installing"
"$APP/scripts/install.sh"
wait_for_api

step "Updating again (must be idempotent)"
"$APP/scripts/update.sh"
wait_for_api
[ "$(grep -c "path => 'cloudinit-editor'" /usr/share/perl5/PVE/API2/Nodes.pm)" = 1 ] ||
    fail "API route registered more than once"

step "Checking the UI bundle is served"
curl -ksSf "$BASE/" | grep -q 'src="/pve2/js/pve-cloudinit-editor.js?v=' ||
    fail "index page does not load the editor bundle"
curl -ksSf "$BASE/pve2/js/pve-cloudinit-editor.js" | grep -q 'PVE.qemu.CloudInitEditor' ||
    fail "editor bundle is not served"

step "Preparing storage and a stopped VM with a Cloud-Init drive"
pvesm set "$STORAGE" --content iso,vztmpl,backup,images,snippets
qm destroy "$VMID" --purge >/dev/null 2>&1 || true
rm -f "/var/lib/vz/snippets/$SNIPPET"
qm create "$VMID" --name e2e --memory 512 --ide2 "$STORAGE:cloudinit"
login

step "Saving a snippet"
api POST "/nodes/$NODE/cloudinit-editor/snippet" --data-urlencode "storage=$STORAGE" \
    --data-urlencode "filename=$SNIPPET" --data-urlencode "vmid=$VMID" \
    --data-urlencode "content=$CONTENT" >/dev/null

step "Loading it back"
loaded=$(api GET "/nodes/$NODE/cloudinit-editor/snippet" -G --data-urlencode "storage=$STORAGE" \
    --data-urlencode "filename=$SNIPPET" --data-urlencode "vmid=$VMID" | jq -r .data.content)
[ "$loaded" = "$CONTENT" ] || fail "loaded snippet differs: $loaded"

step "Rejecting a path traversal filename"
if api POST "/nodes/$NODE/cloudinit-editor/snippet" --data-urlencode "storage=$STORAGE" \
    --data-urlencode "filename=../escape.yaml" --data-urlencode "vmid=$VMID" \
    --data-urlencode "content=x" >/dev/null 2>&1; then
    fail "path traversal filename was accepted"
fi

step "Attaching it and regenerating the Cloud-Init image"
api PUT "/nodes/$NODE/qemu/$VMID/config" \
    --data-urlencode "cicustom=user=$STORAGE:snippets/$SNIPPET" >/dev/null
api PUT "/nodes/$NODE/qemu/$VMID/cloudinit" >/dev/null
# `qm cloudinit dump` ignores cicustom, so read user-data from the regenerated ISO the VM boots with.
qemu-img convert -O raw "$(pvesm path "$STORAGE:$VMID/vm-$VMID-cloudinit.qcow2")" /tmp/e2e-cloudinit.iso
user_data=$(isoinfo -i /tmp/e2e-cloudinit.iso -R -x /user-data)
rm -f /tmp/e2e-cloudinit.iso
[ "$user_data" = "$CONTENT" ] || fail "Cloud-Init image user-data differs: $user_data"

echo "PASS"
