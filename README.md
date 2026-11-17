# Proxmox Cloud-Init YAML Editor

A native ExtJS editor added to the VM's **Cloud-Init** panel. It validates YAML, saves it as a snippets file on a PVE storage, attaches it as the VM's custom user-data, and regenerates the Cloud-Init image.

PVE has no supported third-party UI/API plugin hook. The deploy script patches the PVE UI template and node API registration, so run the update script after every PVE upgrade.

## Layout

| Path | Contents | Tests |
| --- | --- | --- |
| `src/ui/` | ExtJS editor, bundled into `dist/pve-cloudinit-editor.js` | `test/*.test.js` |
| `src/api/` | Perl API module, installed as-is into `/usr/share/perl5` | `test/*.t` |
| `scripts/` | Build script and the `install.sh`/`update.sh` wrappers around `deploy.py` | `test/test_*.py` |
| `test/e2e/` | Docker-based PVE 9 environment and end-to-end check | `npm run test:e2e` |

Formatting follows the PVE codebase: 4-space indentation (`.editorconfig`), and single quotes with a 100-column limit for JavaScript (enforced by Biome).

## Development

```sh
npm ci
npm run check    # lint, build, and all tests
npm run format   # apply JavaScript formatting
```

`npm test` runs the UI (`node --test`), API (`prove`), and deploy (`unittest`) tests. Commit `dist/` after building, so nodes can install without Node.js.

### End-to-end test

`npm run test:e2e` starts a real PVE 9 node in Docker ([`dockurr/proxmox`](https://github.com/dockur/proxmox), see `test/e2e/compose.yml`), installs and re-runs the update script, then saves, loads, attaches, and regenerates a Cloud-Init image through the HTTPS API, checking the user-data inside the generated ISO.

The container is privileged, needs about 32 GB of disk, and works without KVM (`REQUIRE_KVM=N`), including in WSL2 with Docker Desktop. It stays running for manual testing at <https://localhost:8006> (`root`/`root`, VM 9000); remove it and its volumes with `npm run test:e2e:down`. Set `PVE_PORT` if port 8006 is taken. PVE 8 is not covered because the image only ships PVE 9.

## Install

Copy or clone the project onto each Proxmox VE node, then run as root:

```sh
./scripts/install.sh
```

It requires PVE 8.x or 9.x. It backs up the unpatched PVE files to `/var/lib/pve-cloudinit-editor/backups`, installs the UI and API files, and runs a Perl syntax check, restoring all files if the check fails. It then restarts `pveproxy` and `pvedaemon`. Install on every cluster node, because each node serves its own UI and API.

## Update

After pulling a new version or upgrading PVE, run as root on each node:

```sh
./scripts/update.sh
```

To inspect the result without touching the live system, stage it in a directory containing copies of the PVE files: `./scripts/update.sh --system-root /tmp/pve-root`.

## Usage

Open a VM's **Cloud-Init** panel and choose **Edit User-Data YAML**. Select a storage with the `snippets` content type and enter a `.yaml`/`.yml` filename. **Load** reads an existing snippet; **Save and attach** validates and saves the snippet, replaces only the `user=` entry in the VM's `cicustom` setting, and regenerates the Cloud-Init image.

The API requires `VM.Config.Cloudinit` on the VM, plus `Datastore.Audit` on the storage to load or `Datastore.AllocateTemplate` to save. Validation checks YAML syntax only, not Cloud-Init semantics. Snippets are limited to 1 MiB.
