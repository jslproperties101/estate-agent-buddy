// External service configuration. Nothing secret is written in the code:
//  - at build time, scripts/build.mjs copies EAB_* environment variables (or app/.env, which Git ignores) into
//    __EAB_CONFIG__;
//  - on the phone, the same values can be typed in Profile → Settings (kept only on that phone).
// A value typed on the phone wins over the build-time value.
import type { Settings } from './data/types';

export interface BuildConfig {
  googleMapsApiKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  expertApiUrl: string;
}

declare const __EAB_CONFIG__: BuildConfig | undefined;

const built: BuildConfig = (typeof __EAB_CONFIG__ !== 'undefined' && __EAB_CONFIG__) || {
  googleMapsApiKey: '', supabaseUrl: '', supabaseAnonKey: '', expertApiUrl: '',
};

export interface Config extends BuildConfig { source: Record<keyof BuildConfig, 'phone' | 'build' | 'none'> }

export function config(s: Pick<Settings, 'mapsApiKey' | 'supabaseUrl' | 'supabaseAnonKey' | 'expertApiUrl'>): Config {
  const pick = (phone: string | undefined, b: string) => (phone?.trim() ? phone.trim() : b);
  const src = (phone: string | undefined, b: string) => (phone?.trim() ? 'phone' : b ? 'build' : 'none') as 'phone' | 'build' | 'none';
  return {
    googleMapsApiKey: pick(s.mapsApiKey, built.googleMapsApiKey),
    supabaseUrl: pick(s.supabaseUrl, built.supabaseUrl).replace(/\/+$/, ''),
    supabaseAnonKey: pick(s.supabaseAnonKey, built.supabaseAnonKey),
    expertApiUrl: pick(s.expertApiUrl, built.expertApiUrl),
    source: {
      googleMapsApiKey: src(s.mapsApiKey, built.googleMapsApiKey),
      supabaseUrl: src(s.supabaseUrl, built.supabaseUrl),
      supabaseAnonKey: src(s.supabaseAnonKey, built.supabaseAnonKey),
      expertApiUrl: src(s.expertApiUrl, built.expertApiUrl),
    },
  };
}
