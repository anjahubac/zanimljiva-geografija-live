import { useCallback, useEffect, useState } from "react";
import type { Account } from "@contracts/account.schemas";
import { accountApi, type ApiFailure } from "./account-api";

export type SessionState = {
  account: Account | null;
  /** True until the first `/api/session` answer, so the shell does not flash. */
  loading: boolean;
  busy: boolean;
  error: ApiFailure | null;
};

export function useSession() {
  const [state, setState] = useState<SessionState>({
    account: null,
    loading: true,
    busy: false,
    error: null,
  });

  useEffect(() => {
    let live = true;
    void accountApi.session().then((result) => {
      if (!live) return;
      // A cold visit with no cookie is not an error worth showing.
      setState({
        account: result.ok ? result.data : null,
        loading: false,
        busy: false,
        error: null,
      });
    });
    return () => {
      live = false;
    };
  }, []);

  const run = useCallback(
    async (action: () => Promise<{ ok: true; data: Account | null } | { ok: false; error: ApiFailure }>) => {
      setState((current) => ({ ...current, busy: true, error: null }));
      const result = await action();
      setState({
        account: result.ok ? result.data : null,
        loading: false,
        busy: false,
        error: result.ok ? null : result.error,
      });
      return result.ok;
    },
    [],
  );

  const register = useCallback(
    (input: { email: string; password: string; displayName: string }) =>
      run(() => accountApi.register(input)),
    [run],
  );

  const logIn = useCallback(
    (input: { email: string; password: string }) => run(() => accountApi.logIn(input)),
    [run],
  );

  const logOut = useCallback(() => run(() => accountApi.logOut()), [run]);

  const clearError = useCallback(
    () => setState((current) => ({ ...current, error: null })),
    [],
  );

  return { ...state, register, logIn, logOut, clearError };
}
