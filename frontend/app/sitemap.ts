import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/constants";

const ROUTES = ["", "/dashboard", "/community", "/community/report"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
  }));
}
