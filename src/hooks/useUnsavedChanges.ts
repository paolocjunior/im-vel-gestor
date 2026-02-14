import { useState, useEffect, useCallback, useRef } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Tracks whether a form has unsaved changes and blocks navigation with a confirmation dialog.
 * Call `markSaved()` after a successful save to reset dirty state.
 * Pass `initialData` (the loaded data snapshot) and `currentData` (the live form state).
 */
export function useUnsavedChanges(initialData: any, currentData: any) {
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const initialized = useRef(false);

  useEffect(() => {
    if (initialData !== null && initialData !== undefined && !initialized.current) {
      setSavedSnapshot(JSON.stringify(initialData));
      initialized.current = true;
    }
  }, [initialData]);

  const isDirty = initialized.current && savedSnapshot !== "" && JSON.stringify(currentData) !== savedSnapshot;

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        isDirty && currentLocation.pathname !== nextLocation.pathname,
      [isDirty]
    )
  );

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

  return { isDirty, blocker, markSaved };
}
