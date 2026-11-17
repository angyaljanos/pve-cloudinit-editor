import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const outdir = fileURLToPath(new URL('../dist/', import.meta.url));

await rm(outdir, { recursive: true, force: true });
await build({
    entryPoints: [fileURLToPath(new URL('../src/ui/editor.js', import.meta.url))],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2019'],
    outfile: `${outdir}pve-cloudinit-editor.js`,
});
console.log(`Built ${outdir}pve-cloudinit-editor.js`);
