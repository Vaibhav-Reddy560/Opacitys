import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    // Uploads live in Vercel Blob, and the app renders them as small
    // thumbnails (64px strips, ~300px grid tiles). Without this they were
    // served as raw <img src={blobUrl}> at full resolution: measured on a
    // real library, ten tiles pulled 96.5 megapixels off the network and
    // decoded all of it to paint 0.9 MP of thumbnails — a single 6480x3240
    // upload is ~84MB once decoded to a bitmap. That is what made the
    // library slow to load and made hovering anywhere near a tile stutter,
    // since every repaint recomposites those oversized layers.
    // Allowlisting the host here lets next/image resize + re-encode
    // (AVIF/WebP) to the size actually displayed.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Google account avatars (sidebar footer) and Dribbble shot
      // thumbnails (Fingerprint's Portfolio panel).
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "cdn.dribbble.com" },
    ],
  },
};

export default nextConfig;
