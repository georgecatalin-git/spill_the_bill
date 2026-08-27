/**
 * Runs `lib/reconcile/cases.ts` outside the app.
 *
 * The matcher is pure — no React, no Supabase, no Expo — so it can simply be
 * compiled and run, which is worth more here than a typecheck: every failure
 * this module has had was a name scoring wrongly, and a type never had an
 * opinion about that.
 *
 * The one wrinkle is `@/…`. TypeScript resolves it for checking but emits it
 * untouched, so the compiled output asks Node for a package named `@`. A
 * symlink from the build's own `node_modules/@` back to its root satisfies
 * that, and leaves the source using the same import style as the rest of the
 * app.
 *
 * That symlink is why the build goes to a temp directory and never inside the
 * project. It first went to `node_modules/.cache/`, which broke the app: this
 * is a git worktree with no `node_modules` of its own — everything resolves
 * from the checkout above it — so creating one, holding nothing but this
 * build, gave Metro somewhere to stop looking. The bundler could no longer
 * find react-native.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), 'split-reconcile-cases');

// This is a git worktree: its own node_modules is empty and everything resolves
// from the checkout above it, so ask Node where TypeScript actually is rather
// than assuming a local .bin.
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

rmSync(out, { recursive: true, force: true });

execFileSync(process.execPath, [tsc, '-p', 'tsconfig.cases.json', '--outDir', out], {
  cwd: root,
  stdio: 'inherit',
});

mkdirSync(join(out, 'node_modules'), { recursive: true });
symlinkSync(out, join(out, 'node_modules', '@'), 'dir');

execFileSync(process.execPath, [join(out, 'lib', 'reconcile', 'cases.js')], { stdio: 'inherit' });
