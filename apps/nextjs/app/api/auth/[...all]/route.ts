import { createAuth } from "@habit/auth";
import { toNextJsHandler } from "@habit/auth/next";

const auth = createAuth();

const unavailable = async () =>
  new Response(JSON.stringify({ error: "Auth is not configured." }), {
    status: 503,
    headers: {
      "Content-Type": "application/json",
    },
  });

const handler = auth
  ? toNextJsHandler(auth)
  : {
      GET: unavailable,
      POST: unavailable,
      PATCH: unavailable,
      PUT: unavailable,
      DELETE: unavailable,
    };

export const { GET, POST, PATCH, PUT, DELETE } = handler;
