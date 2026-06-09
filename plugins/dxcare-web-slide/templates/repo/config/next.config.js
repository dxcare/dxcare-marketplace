/** @type {import('next').NextConfig} */
const nextConfig = {
  // Preserve trailing slashes so `./theme.css` inside a slide HTML resolves to
  // `/slides/<slug>/theme.css`, not `/slides/theme.css`. Without this Next.js
  // 308-redirects away the slash and breaks relative asset links.
  trailingSlash: true,
  async rewrites() {
    return [
      { source: '/slides/:path*', destination: '/api/slide/:path*' },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;
