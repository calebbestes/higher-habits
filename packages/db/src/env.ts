import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let envLoaded = false;

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(packageDirectory, "../../..");

const getEnvFileCandidates = () => {
    const candidates = new Set<string>();
    const rootsToSearch = [process.cwd(), workspaceRoot];

    for (const startDirectory of rootsToSearch) {
        let currentDirectory = startDirectory;

        while (true) {
            candidates.add(resolve(currentDirectory, ".env.local"));
            candidates.add(resolve(currentDirectory, ".env"));

            const parentDirectory = dirname(currentDirectory);

            if (parentDirectory === currentDirectory) {
                break;
            }

            currentDirectory = parentDirectory;
        }
    }

    return [...candidates];
};

export function ensureDbEnv() {
    if (envLoaded || process.env.POSTGRES_URL) {
        envLoaded = true;
        return;
    }

    if (typeof process.loadEnvFile !== "function") {
        return;
    }

    for (const envFilePath of getEnvFileCandidates()) {
        if (!existsSync(envFilePath)) {
            continue;
        }

        process.loadEnvFile(envFilePath);

        if (process.env.POSTGRES_URL) {
            break;
        }
    }

    envLoaded = Boolean(process.env.POSTGRES_URL);
}
