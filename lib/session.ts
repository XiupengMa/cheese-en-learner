import { auth } from "./auth";

// Real auth enforcement for the API routes. proxy.ts only does an
// optimistic cookie check; every route that spends LLM tokens must
// verify the session here.
export function getSession(req: Request) {
  return auth.api.getSession({ headers: req.headers });
}

export function unauthorized() {
  return Response.json({ error: "Please sign in to continue." }, { status: 401 });
}
