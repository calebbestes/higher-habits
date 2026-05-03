import "server-only";

import { createAuth } from "@habit/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

type AuthUser = {
    id: string;
    email: string;
    name: string;
    image?: string | null;
    emailVerified: boolean;
};

type AuthSession = {
    session: {
        id: string;
        userId: string;
        expiresAt: Date | string;
        token: string;
        createdAt: Date | string;
        updatedAt: Date | string;
    };
    user: AuthUser;
};

export async function getServerSession(): Promise<AuthSession | null> {
    const auth = createAuth();

    if (!auth) {
        return null;
    }

    return (await auth.api.getSession({
        headers: await headers(),
    })) as AuthSession | null;
}

export async function requireUser(): Promise<AuthSession["user"]> {
    const session = await getServerSession();

    if (!session) {
        redirect("/login");
    }

    return session.user;
}

export async function getRequestSession(
    request: Request,
): Promise<AuthSession | null> {
    const auth = createAuth();

    if (!auth) {
        return null;
    }

    return (await auth.api.getSession({
        headers: request.headers,
    })) as AuthSession | null;
}

export async function requireRequestUser(
    request: Request,
): Promise<AuthSession["user"]> {
    const session = await getRequestSession(request);

    if (!session) {
        throw new Error("UNAUTHORIZED");
    }

    return session.user;
}

export function toAuthErrorResponse(error: unknown) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "Auth is not configured.") {
        return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return null;
}
