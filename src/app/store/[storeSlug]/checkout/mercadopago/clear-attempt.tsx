"use client";
import { useEffect } from "react";
export function ClearAttempt({ requestKey }: { requestKey: string }) {
  useEffect(() => {
    for (const key of Object.keys(sessionStorage)) {
      if (
        key.startsWith(`mp-checkout:${window.location.host}:`) &&
        sessionStorage.getItem(key) === requestKey
      )
        sessionStorage.removeItem(key);
    }
  }, [requestKey]);
  return null;
}
