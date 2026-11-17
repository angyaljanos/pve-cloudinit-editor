import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const output = new URL("../dist/", import.meta.url);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  entryPoints: [new URL("../src/editor.js", import.meta.url).pathname],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome109"],
  outfile: new URL("../dist/editor.js", import.meta.url).pathname,
});
for (const file of ["manifest.json", "popup.html", "popup.js", "popup.css"]) {
  await cp(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}
await cp(new URL("../src/editor.css", import.meta.url), new URL("../dist/editor.css", import.meta.url));
console.log(`Built extension in ${new URL("../dist/", import.meta.url).pathname}`);
