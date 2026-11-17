#!/usr/bin/env python3

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
UI_BUNDLE = PROJECT_ROOT / "dist/pve-cloudinit-editor.js"
API_MODULE = PROJECT_ROOT / "src/api/PVE/API2/Nodes/Nodeinfo/CloudInitEditor.pm"

NODES_API = "usr/share/perl5/PVE/API2/Nodes.pm"
UI_TEMPLATE = "usr/share/pve-manager/index.html.tpl"
API_TARGET = "usr/share/perl5/PVE/API2/Nodes/Nodeinfo/CloudInitEditor.pm"
UI_TARGET = "usr/share/pve-manager/js/pve-cloudinit-editor.js"
BACKUP_DIR = "var/lib/pve-cloudinit-editor/backups"

API_IMPORT_ANCHOR = "use PVE::API2::NodeConfig;\n"
API_ROUTE_ANCHOR = """__PACKAGE__->register_method({
    subclass => "PVE::API2::Qemu",
    path => 'qemu',
});
"""
API_IMPORT = """# pve-cloudinit-editor API import
use PVE::API2::Nodes::Nodeinfo::CloudInitEditor;
"""
API_ROUTE = """
# pve-cloudinit-editor API route
__PACKAGE__->register_method({
    subclass => "PVE::API2::Nodes::Nodeinfo::CloudInitEditor",
    path => 'cloudinit-editor',
});
"""
UI_ANCHOR = """    <script type="text/javascript">
    if (typeof(PVE) === 'undefined') PVE = {};"""
UI_SCRIPT = re.compile(
    r'^[ \t]*<script type="text/javascript" '
    r'src="/pve2/js/pve-cloudinit-editor\.js\?v=[0-9a-f]+"></script>\n',
    re.MULTILINE,
)


class DeployError(RuntimeError):
    pass


def replace_anchor(text, anchor, replacement, description):
    if text.count(anchor) != 1:
        raise DeployError(f"unable to locate the {description}")
    return text.replace(anchor, replacement, 1)


def patch_nodes_api(text):
    has_import = API_IMPORT in text
    has_route = API_ROUTE in text
    if has_import != has_route:
        raise DeployError("PVE API file has a partial pve-cloudinit-editor patch")
    if has_import:
        return text

    text = replace_anchor(
        text, API_IMPORT_ANCHOR, API_IMPORT + API_IMPORT_ANCHOR, "PVE API import point"
    )
    return replace_anchor(
        text, API_ROUTE_ANCHOR, API_ROUTE_ANCHOR + API_ROUTE, "PVE API registration point"
    )


def patch_ui_template(text, bundle_hash):
    script = (
        '    <script type="text/javascript" '
        f'src="/pve2/js/pve-cloudinit-editor.js?v={bundle_hash}"></script>\n'
    )
    text = UI_SCRIPT.sub("", text)
    return replace_anchor(text, UI_ANCHOR, script + UI_ANCHOR, "PVE UI script insertion point")


def is_patched(path):
    return "pve-cloudinit-editor" in path.read_text(encoding="utf-8")


def write_atomic(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as file:
            file.write(data)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def snapshot(paths):
    return {path: path.read_bytes() if path.exists() else None for path in paths}


def restore(saved):
    for path, data in saved.items():
        if data is None:
            path.unlink(missing_ok=True)
        else:
            write_atomic(path, data)


def check_perl_syntax(system_root):
    try:
        subprocess.run(["perl", "-c", str(system_root / NODES_API)], check=True)
    except subprocess.CalledProcessError as error:
        raise DeployError("Perl syntax check failed") from error


def pve_major_version():
    output = subprocess.run(
        ["pveversion", "-v"], check=True, capture_output=True, text=True
    ).stdout
    match = re.search(r"^pve-manager:\s*(\d+)\.", output, re.MULTILINE)
    if not match:
        raise DeployError("unable to determine the installed pve-manager version")
    return int(match.group(1))


def deploy(system_root, verify=None):
    system_root = Path(system_root)
    if not UI_BUNDLE.is_file():
        raise DeployError(f"{UI_BUNDLE} is missing; run npm ci && npm run build first")

    nodes_api = system_root / NODES_API
    ui_template = system_root / UI_TEMPLATE
    try:
        bundle = UI_BUNDLE.read_bytes()
        files = {
            nodes_api: patch_nodes_api(nodes_api.read_text(encoding="utf-8")).encode(),
            ui_template: patch_ui_template(
                ui_template.read_text(encoding="utf-8"), hashlib.sha256(bundle).hexdigest()[:12]
            ).encode(),
            system_root / API_TARGET: API_MODULE.read_bytes(),
            system_root / UI_TARGET: bundle,
        }
    except OSError as error:
        raise DeployError(f"cannot read files: {error}") from error

    # Back up pristine PVE files; refreshed whenever a PVE upgrade replaced them.
    for path in (nodes_api, ui_template):
        if not is_patched(path):
            backup = system_root / BACKUP_DIR / path.relative_to(system_root)
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, backup)

    saved = snapshot(files)
    try:
        for path, data in files.items():
            write_atomic(path, data)
        if verify:
            verify(system_root)
    except BaseException:
        restore(saved)
        raise


def main():
    parser = argparse.ArgumentParser(description="Install or update the Cloud-Init editor.")
    parser.add_argument("action", choices=("install", "update"))
    parser.add_argument(
        "--system-root",
        type=Path,
        help="stage into this directory instead of the live system; skips checks and restarts",
    )
    args = parser.parse_args()

    try:
        if args.system_root:
            deploy(args.system_root)
            print(f"{args.action.capitalize()} staged under {args.system_root}.")
            return

        if os.geteuid() != 0:
            raise DeployError("run this command as root on a Proxmox VE node")
        major = pve_major_version()
        if major not in (8, 9):
            raise DeployError(f"PVE {major} is unsupported; PVE 8 and 9 are supported")
        deploy(Path("/"), verify=check_perl_syntax)
        subprocess.run(["systemctl", "restart", "pveproxy", "pvedaemon"], check=True)
        print(f"{args.action.capitalize()} complete. Reload the Proxmox web UI.")
    except (DeployError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"pve-cloudinit-editor: {error}\n")


if __name__ == "__main__":
    main()
