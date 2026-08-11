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
