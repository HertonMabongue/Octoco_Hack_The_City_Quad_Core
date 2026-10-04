import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/constants";

const ROUTES = ["", "/community", "/community/report", "/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
  }));
}
