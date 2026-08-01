import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";

export const authClient = createAuthClient({
  // Type-only import of the server auth: types session.user's additional
  // fields (dictionaryModel/teacherModel) and updateUser's accepted body.
  plugins: [passkeyClient(), inferAdditionalFields<typeof auth>()],
});
