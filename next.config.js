/** @type {import('next').NextConfig} */
const nextConfig = {
  // The image runs `next start` (full node_modules are installed), so standalone output is not used.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
