import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Tracks whether a form has unsaved changes and warns before navigating away.
 * Returns a dialog state so the caller can render <UnsavedChangesDialog />.
 */
export function useUnsavedChanges(initialData: any, currentData: any) {
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const initialized = useRef(false);
  const navigate = useNavigate();

  const [showDialog, setShowDialog] = useState(false);
  const pendingPath = useRef<string | null>(null);

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

  /** Wrap your "Voltar" navigation with this to get a confirm dialog when dirty */
  const guardedNavigate = useCallback((to: string) => {
    if (isDirty) {
      pendingPath.current = to;
      setShowDialog(true);
    } else {
      navigate(to);
    }
  }, [isDirty, navigate]);

  const onStay = useCallback(() => {
    setShowDialog(false);
    pendingPath.current = null;
  }, []);

  const onLeave = useCallback(() => {
    setShowDialog(false);
    if (pendingPath.current) {
      navigate(pendingPath.current);
    }
  }, [navigate]);

  return { isDirty, markSaved, guardedNavigate, showDialog, onStay, onLeave };
}
