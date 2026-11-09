import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
// Run from plugin; all output is local and reproducible from source.
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/@elgato/cli/bin/streamdeck.mjs', 'pack', 'com.kyuubisoft.fivem.sdPlugin', '--output', '../dist', '--force', '--no-file-list'], { stdio: 'inherit' });
execFileSync('python3', ['resources/ks_streamdeck/tests/package.py'], {cwd: resolve('..'), stdio:'inherit'});
execFileSync('python3', ['plugin/scripts/bundle.py'], {cwd: resolve('..'), stdio:'inherit'});
