// A short message at the bottom of the screen ("Saved.", "Moved to Viewing History …").
import { createContext, useContext } from 'react';

export type ShowToast = (text: string) => void;
export const ToastContext = createContext<ShowToast>(() => {});
export const useToast = () => useContext(ToastContext);
