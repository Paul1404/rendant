import { createAuthClient } from "better-auth/react";

// No adminClient plugin: the app administers accounts through its own oRPC
// procedures, which enforce the last-active-admin guard and write audit events.
export const authClient = createAuthClient({
	basePath: "/api/auth",
});

export const { signIn, signOut, useSession } = authClient;
