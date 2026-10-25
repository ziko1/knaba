import type { APIRoute } from "astro";
import { services } from "../../data/company";

export const prerender = true;
export const GET: APIRoute = () => new Response(JSON.stringify({
  version: 1,
  // Only current marketed construction cleaning appears on public API; keep legacy IDs in CRM.
  services: services.filter(item => item.slug === "baureinigung").map(({ slug, name, description, details }) => ({ slug, name, description, details })),
}), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" } });
