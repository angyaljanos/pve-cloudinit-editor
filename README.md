# Proxmox Cloud-Init YAML Editor

A Chromium Manifest V3 extension that adds a small Cloud-Init YAML editor to a Proxmox VE web page. It validates YAML syntax in the browser; it does not save settings to Proxmox or check Cloud-Init-specific fields.

## Build and test

```sh
npm ci
npm test
npm run build
```

The built extension is in `dist/`.

## Install

```sh
./scripts/install.sh
```

The script copies the built extension to `~/.local/share/pve-cloudinit-editor`. In Chromium, open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose that folder. The extension requires HTTPS on the standard Proxmox port 8006.

To install into a different folder, pass it as the first argument:

```sh
./scripts/install.sh /path/to/extension
```

## Update

Pull or copy the new project files, then run:

```sh
./scripts/update.sh
```

Use the same optional folder argument if you installed to a custom location. Reload the extension from `chrome://extensions` after updating.

Click the extension icon on a Proxmox tab and choose **Open editor**. The editor appears in the page; its contents stay in the current page until it is reloaded. Choose **Validate YAML** to check syntax and get a line/column for parser errors.
