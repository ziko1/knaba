import type { APIRoute } from "astro";
import { services } from "../../data/company";

export const prerender = true;
export const GET: APIRoute = () => new Response(JSON.stringify({
  version: 1,
  services: services.map(({ slug, name, description, details }) => ({ slug, name, description, details })),
}), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" } });
