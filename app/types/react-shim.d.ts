// Minimal React types for type-checking the screens in an environment where @types/react cannot be downloaded.
// It checks component props, hook usage, unused code and all app logic; DOM attribute names are not checked.
// When @types/react can be installed (normal internet), delete this file and add @types/react + @types/react-dom.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'react' {
  export type ReactNode = any;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export interface MutableRefObject<T> { current: T }
  export interface RefObject<T> { readonly current: T | null }
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useRef<T>(initial: T | null): RefObject<T>;
  export function useId(): string;
  export interface Context<T> { Provider: (p: { value: T; children?: ReactNode }) => any; _t?: T }
  export function createContext<T>(value: T): Context<T>;
  export function useContext<T>(c: Context<T>): T;
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T): T;
  export const StrictMode: (p: { children?: ReactNode }) => any;
  export function memo<P>(c: (props: P) => any): (props: P) => any;
}
declare module 'react/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare module 'react-dom' { export function createPortal(node: any, container: Element): any }
declare module 'react-dom/client' { export function createRoot(el: Element): { render(node: any): void } }
declare module '*.css';
type EabFormEl = HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement;
interface EabEvent<T> { target: T; currentTarget: T; key: string; preventDefault(): void; stopPropagation(): void }
interface EabProps {
  [attr: string]: any;
  onChange?: (e: EabEvent<EabFormEl>) => void;
  onInput?: (e: EabEvent<EabFormEl>) => void;
  onBlur?: (e: EabEvent<EabFormEl>) => void;
  onClick?: (e: EabEvent<HTMLElement>) => void;
  onKeyDown?: (e: EabEvent<EabFormEl>) => void;
}
declare namespace JSX {
  type Element = any;
  interface IntrinsicElements { [name: string]: EabProps }
  interface IntrinsicAttributes { key?: string | number }
  interface ElementChildrenAttribute { children: unknown }
}
// @capacitor/core is installed only for the Android/iOS build; type-check against the same small surface the app uses.
declare module '@capacitor/core' {
  export const Capacitor: { isNativePlatform(): boolean; getPlatform(): string; isPluginAvailable(name: string): boolean; convertFileSrc(path: string): string };
  export function registerPlugin<T = any>(name: string): T;
}

// Images bundled into the code as data URLs (scripts/build.mjs loader).
declare module '*.webp' { const url: string; export default url; }
