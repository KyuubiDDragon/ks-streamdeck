import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
for (const suffix of ['', '@2x']) {
  const path = `com.kyuubisoft.fivem.sdPlugin/imgs/plugin${suffix}`;
  await writeFile(`${path}.png`, new Resvg(await readFile(`${path}.svg`)).render().asPng());
}
const notices = ['Third-party components bundled in KS FiveM Animations.\n'];
for (const name of ['@elgato/streamdeck', '@elgato/utils', '@elgato/schemas', 'ws', 'zod']) {
  const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  const license = await readFile(`node_modules/${name}/LICENSE`, 'utf8');
  notices.push(`\n${name} ${pkg.version}\n${'='.repeat(60)}\n${license}`);
}
await writeFile('com.kyuubisoft.fivem.sdPlugin/THIRD-PARTY-NOTICES.txt', notices.join('\n').replace(/\r\n?/g, '\n'));
await build({ entryPoints: ['src/plugin.ts'], outfile: 'com.kyuubisoft.fivem.sdPlugin/bin/plugin.js',
  bundle: true, platform: 'node', target: 'node20', format: 'esm',
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  external: ['bufferutil', 'utf-8-validate'], sourcemap: false });
