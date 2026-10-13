// A short message at the bottom of the screen ("Saved on this phone.", "Moved to Viewing History …").
// 'ok' messages (a save succeeded) stay two seconds. 'error' messages (something failed or was refused) stay six
// seconds and are announced as alerts, so a failure is never as brief as a success.
import { createContext, useContext } from 'react';

export type ToastKind = 'ok' | 'error';
export const TOAST_OK_MS = 2000;
export const TOAST_ERROR_MS = 6000;

export type ShowToast = (text: string, kind?: ToastKind) => void;
export const ToastContext = createContext<ShowToast>(() => {});
export const useToast = () => useContext(ToastContext);
