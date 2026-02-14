import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Tracks whether a form has unsaved changes and warns before navigating away.
 * Uses window.confirm + beforeunload instead of useBlocker (which requires a data router).
 */
export function useUnsavedChanges(initialData: any, currentData: any) {
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const initialized = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (initialData !== null && initialData !== undefined && !initialized.current) {
      setSavedSnapshot(JSON.stringify(initialData));
      initialized.current = true;
    }
  }, [initialData]);

  const isDirty = initialized.current && savedSnapshot !== "" && JSON.stringify(currentData) !== savedSnapshot;

  // Browser tab close / refresh
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const markSaved = useCallback(() => {
    setSavedSnapshot(JSON.stringify(currentData));
  }, [currentData]);

  /** Wrap your "Voltar" navigation with this to get a confirm prompt when dirty */
  const guardedNavigate = useCallback((to: string) => {
    if (isDirty) {
      const leave = window.confirm("Você tem alterações não salvas. Deseja sair sem salvar?");
      if (!leave) return;
    }
    navigate(to);
  }, [isDirty, navigate]);

  return { isDirty, markSaved, guardedNavigate };
}
