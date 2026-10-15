import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/dashboard-bancada",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
