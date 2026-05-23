import type { NextConfig } from "next";

const uploadLimit = (process.env.UPLOAD_MAX_SIZE_MB
  ? `${process.env.UPLOAD_MAX_SIZE_MB}mb`
  : "250mb") as `${number}mb`;

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: uploadLimit,
    },
    // Limite corps requête quand middleware actif (upload 3D volumineux).
    proxyClientMaxBodySize: uploadLimit,
  },
};

export default nextConfig;
