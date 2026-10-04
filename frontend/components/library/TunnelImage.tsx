"use client";

import { useEffect, useState } from "react";

import { API_HEADERS } from "@/lib/constants";

// A plain <img src> can't send the ngrok-skip-browser-warning header, so
// behind a free ngrok tunnel it would receive the interstitial HTML page
// and render as a broken image. Fetching it ourselves with the header and
// showing the blob avoids that, and works the same against any backend.
export default function TunnelImage({
  src,
  alt,
  className,
  fallback,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) return;
    let revoked = false;
    let created: string | null = null;

    fetch(src, { headers: API_HEADERS })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (revoked) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      // 404 is normal: retention has already deleted this photo.
      .catch(() => !revoked && setFailed(true));

    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src]);

  if (!src || failed || !objectUrl) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={objectUrl} alt={alt} className={className} />;
}
