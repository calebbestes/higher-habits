import * as Linking from "expo-linking";

const AUTH_CALLBACK_PATH = "/auth-callback";
const DEFAULT_RETURN_PATH = "/";

function getSafeReturnPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return DEFAULT_RETURN_PATH;
  }

  return path;
}

export function getNativeAuthCallbackURL() {
  const params = new URLSearchParams({
    next: DEFAULT_RETURN_PATH,
  });

  return `${AUTH_CALLBACK_PATH}?${params.toString()}`;
}

export function getNativeAuthCallbackURLForPath(path: string) {
  const params = new URLSearchParams({
    next: getSafeReturnPath(path),
  });

  return `${AUTH_CALLBACK_PATH}?${params.toString()}`;
}

// Better Auth's Expo client converts callbackURL and newUserCallbackURL, but
// errorCallbackURL is passed through unchanged. Give error redirects the
// same native destination explicitly so OAuth failures do not fall back to
// the web login page.
export function getNativeAuthErrorCallbackURL() {
  const params = new URLSearchParams({
    next: DEFAULT_RETURN_PATH,
  });

  return Linking.createURL(`${AUTH_CALLBACK_PATH}?${params.toString()}`);
}

export function getNativeAuthErrorCallbackURLForPath(path: string) {
  const params = new URLSearchParams({
    next: getSafeReturnPath(path),
  });

  return Linking.createURL(`${AUTH_CALLBACK_PATH}?${params.toString()}`);
}
