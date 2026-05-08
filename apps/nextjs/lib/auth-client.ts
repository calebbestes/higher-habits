"use client";

import { createAuthClient } from "@habit/auth/client";

export const authClient = createAuthClient({
  basePath: "/api/auth",
});
