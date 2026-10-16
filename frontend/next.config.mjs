/** @type {import('next').NextConfig} */
const nextConfig = {
  // Same-origin API proxy: browser calls /backend-api/* (no CORS preflight),
  // Next.js forwards to Laravel server-side. Uses the /index.php/* prefix
  // because Hostinger hcdn currently doesn't execute .htaccess rewrites,
  // so pretty /api/* URLs 404 at the edge (verified: /up and /api/* 404,
  // /index.php/api/* 200).
  async rewrites() {
    const backend =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://simplexchemo.curvemetrics.in/index.php/api';
    // Normalize: ensure exactly one trailing /api or /index.php/api path.
    const dest = backend.replace(/\/$/, '');
    return [
      {
        source: '/backend-api/:path*',
        destination: `${dest}/:path*`,
      },
    ];
  },
};

export default nextConfig;
