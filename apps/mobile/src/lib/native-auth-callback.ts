import * as Linking from "expo-linking";

export function getNativeAuthCallbackURL() {
  return Linking.createURL("/");
}
