/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep firebase-admin out of the server-component bundler (Next 14 form).
    serverComponentsExternalPackages: ["firebase-admin"],
  },
};

export default nextConfig;
