// esbuild plugin: `@capacitor/core` comes from the real package when it is installed (the Android/iOS build on
// GitHub Actions), otherwise from src/native/capacitor-stub.ts, which always reports "web".
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const installed = () => existsSync(resolve('node_modules/@capacitor/core/package.json'));

export function capacitorPlugin({ forceStub = false } = {}) {
  return {
    name: 'capacitor-core',
    setup(b) {
      b.onResolve({ filter: /^@capacitor\/core$/ }, () =>
        !forceStub && installed() ? undefined : { path: resolve('src/native/capacitor-stub.ts') });
    },
  };
}
capacitorPlugin.real = installed;
