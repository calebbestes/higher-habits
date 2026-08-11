// Better Auth lazy-loads expo-network during startup, which can resolve to an
// unknown Metro module in Expo Go unless it is already in the main bundle.
import "expo-network";

import {
  expoClient,
  getSetCookie,
  storageAdapter,
} from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

const localAuthURL =
  Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";
const deployedAuthURL = "https://higher-habits.vercel.app";
const defaultAuthURL = __DEV__ ? localAuthURL : deployedAuthURL;

export const AUTH_BASE_URL = (
  process.env.EXPO_PUBLIC_AUTH_URL ?? defaultAuthURL
).replace(/\/$/, "");

const storagePrefix = "higher-habits";
const cookieStorageKey = `${storagePrefix}_cookie`;
const authStorage = storageAdapter(SecureStore);

export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
  sessionOptions: {
    refetchOnWindowFocus: false,
  },
  plugins: [
    expoClient({
      scheme: "mobile",
      storagePrefix,
      storage: SecureStore,
    }),
  ],
});

type SessionResponse = Awaited<ReturnType<typeof authClient.getSession>>;
export type MobileSession = NonNullable<SessionResponse["data"]>;

let inFlightSessionRequest: Promise<SessionResponse> | null = null;
let currentMobileSession: MobileSession | null = null;
let hasResolvedMobileSession = false;
const mobileSessionListeners = new Set<() => void>();

function notifyMobileSessionListeners() {
  for (const listener of mobileSessionListeners) listener();
}

export function fetchMobileSession(options?: { force?: boolean }) {
  if (!inFlightSessionRequest || options?.force) {
    const sessionRequest = authClient
      .getSession({
        query: {
          disableRefresh: true,
        },
        fetchOptions: {
          timeout: 10_000,
        },
      })
      .then((response) => {
        if (inFlightSessionRequest === sessionRequest) {
          currentMobileSession = response.data ?? null;
          hasResolvedMobileSession = true;
          notifyMobileSessionListeners();
        }
        return response;
      })
      .catch((error) => {
        if (inFlightSessionRequest === sessionRequest) {
          currentMobileSession = null;
          hasResolvedMobileSession = true;
          notifyMobileSessionListeners();
        }
        throw error;
      })
      .finally(() => {
        if (inFlightSessionRequest === sessionRequest) {
          inFlightSessionRequest = null;
        }
      });

    inFlightSessionRequest = sessionRequest;
  }

  return inFlightSessionRequest;
}

export function useMobileSession() {
  const [state, setState] = useState({
    data: currentMobileSession,
    isPending: !hasResolvedMobileSession,
  });

  const [isRefetching, setIsRefetching] = useState(false);

  const refetch = useCallback(async () => {
    setIsRefetching(true);

    try {
      await fetchMobileSession();
    } finally {
      setIsRefetching(false);
    }
  }, []);

  useEffect(() => {
    const listener = () => {
      setState({
        data: currentMobileSession,
        isPending: !hasResolvedMobileSession,
      });
    };

    mobileSessionListeners.add(listener);
    listener();
    void refetch();
    return () => {
      mobileSessionListeners.delete(listener);
    };
  }, [refetch]);

  return { ...state, isRefetching, refetch };
}

export async function persistAuthCallbackCookie(cookie: string) {
  const previousCookie = authStorage.getItem(cookieStorageKey) ?? undefined;
  await authStorage.setItem(
    cookieStorageKey,
    getSetCookie(cookie, previousCookie),
  );
}
