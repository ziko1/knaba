import { siteConfig } from "../data/site";
import { services } from "../data/company";
import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const paths = [
    "/",
    "/leistungen/",
    "/branchen/",
    "/unternehmen/",
    "/karriere/",
    "/kontakt/",
    "/planer/",
    "/impressum/",
    "/datenschutz/",
    ...services.map((s) => `/leistungen/${s.slug}/`),
  ];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    paths
      .map((path) => `<url><loc>${siteConfig.origin}${path}</loc></url>`)
      .join("") +
    "</urlset>\n";
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
