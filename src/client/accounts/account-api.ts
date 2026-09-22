import {
  accountErrorSchema,
  profileSchema,
  sessionSchema,
  type Account,
  type AccountError,
  type Profile,
} from "@contracts/account.schemas";

/** `NETWORK` is the one failure the server cannot name for us. */
export type ApiFailure = AccountError | "NETWORK";
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

async function request<T>(
  path: string,
  parse: (body: unknown) => T,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      // The session is an HttpOnly cookie; no token is ever held in JS.
      credentials: "same-origin",
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
  } catch {
    return { ok: false, error: "NETWORK" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: response.ok ? "INTERNAL" : "NETWORK" };
  }

  if (!response.ok) {
    const parsed = accountErrorSchema.safeParse(body);
    return { ok: false, error: parsed.success ? parsed.data.error : "INTERNAL" };
  }

  try {
    return { ok: true, data: parse(body) };
  } catch {
    return { ok: false, error: "INTERNAL" };
  }
}

const post = (path: string, body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const accountApi = {
  session: () =>
    request("/api/session", (body) => sessionSchema.parse(body).account as Account | null),

  register: (input: { email: string; password: string; displayName: string }) =>
    request("/api/register", (body) => sessionSchema.parse(body).account, post("/api/register", input)),

  logIn: (input: { email: string; password: string }) =>
    request("/api/login", (body) => sessionSchema.parse(body).account, post("/api/login", input)),

  logOut: () =>
    request("/api/logout", (body) => sessionSchema.parse(body).account, post("/api/logout", {})),

  profile: (page: number): Promise<ApiResult<Profile>> =>
    request(`/api/profile?page=${page}`, (body) => profileSchema.parse(body)),
};
