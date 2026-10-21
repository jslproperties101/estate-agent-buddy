// Stand-in for @capacitor/core, used when the Capacitor packages are not installed (the browser build in a workspace
// without internet, and the unit/screen tests). It always reports "web", so every screen uses its browser path.
// The Android/iOS build (GitHub Actions) installs the real @capacitor/core, and scripts/build.mjs uses that instead.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
  isPluginAvailable: (_name: string) => false,
  convertFileSrc: (path: string) => path,
};
export function registerPlugin<T = any>(_name: string): T {
  return new Proxy({}, { get: () => async () => { throw new Error('native-unavailable'); } }) as T;
}
