import { mkdir, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outdir = ".test-build";
const outfile = `${outdir}/combat.test.mjs`;

await rm(outdir, { force: true, recursive: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ["tests/combat.test.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});

await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
