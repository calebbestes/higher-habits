// Better Auth lazy-loads expo-network during startup, which can resolve to an
// unknown Metro module in Expo Go unless it is already in the main bundle.
import "expo-network";

import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const localAuthURL =
  Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

export const AUTH_BASE_URL = (
  process.env.EXPO_PUBLIC_AUTH_URL ?? localAuthURL
).replace(/\/$/, "");

export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
  plugins: [
    expoClient({
      scheme: "mobile",
      storagePrefix: "higher-habits",
      storage: SecureStore,
    }),
  ],
});
