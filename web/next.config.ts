import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Incluir keyrings BLE en el bundle serverless de Vercel
  outputFileTracingIncludes: {
    "/api/ble/match": ["./private/ble-keyring/**/*"],
  },
};

export default nextConfig;
