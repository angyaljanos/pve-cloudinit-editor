#!/bin/sh
# End-to-end test on a real PVE 9 node in Docker (dockurr/proxmox). Needs a privileged container.
set -eu

cd "$(dirname -- "$0")"

case "${1:-test}" in
test)
    docker compose up -d
    docker compose exec -T pve /opt/pve-cloudinit-editor/test/e2e/check.sh
    echo "PVE stays running at https://localhost:${PVE_PORT:-8006} (root/root). Remove it with: $0 down"
    ;;
down)
    docker compose down -v
    ;;
*)
    echo "usage: $0 [test|down]" >&2
    exit 2
    ;;
esac
