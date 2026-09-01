import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: { styledComponents: true },
  transpilePackages: ["@razorpay/blade"],
};

export default nextConfig;
