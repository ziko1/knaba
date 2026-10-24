/** Canonicalizes ONLY nondeterministic Astro island IDs for equivalence checks.
 * Exact deployment integrity still requires hashing the unmodified response bytes.
 */
export function normalizedArtifactBytes(name, bytes) {
  if (!name.endsWith('.html')) return bytes;
  let position=0;
  const normalized=bytes.toString('utf8').replace(/<astro-island\b[^>]*>/g,tag =>
    tag.replace(/\buid="[^"]+"/,()=>'uid="island-'+(++position)+'"')
  );
  return Buffer.from(normalized,'utf8');
}
