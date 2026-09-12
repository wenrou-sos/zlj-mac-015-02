import { createContext, useCallback, useContext, useState } from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, type = "ok") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2600);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
