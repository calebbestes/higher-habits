import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    transpilePackages: [
        "@habit/ui",
        "@habit/auth",
        "@habit/db",
        "@habit/validators",
        "@habit/tailwind-config",
    ],
};

export default nextConfig;
