import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "postgres", "bcryptjs"],
};

export default nextConfig;
