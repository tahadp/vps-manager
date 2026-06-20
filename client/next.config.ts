import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    // Wave 4: real type errors should fail production build.
    // Previous audits (T4a ThemeProvider ComponentProps, T6 Modal title: ReactNode,
    // Wave 2 useInView/Modal ref types) resolved all pre-existing TS errors;
    // tsc --noEmit exits 0. Keeping the gate on enforces type correctness going forward.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
