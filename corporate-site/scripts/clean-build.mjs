import {rm} from 'node:fs/promises';

// Astro and Vite publish into separate generated trees. Remove both before a
// build so switching release modes cannot retain old hashed CSS/JS assets.
// Resolve from this script, never an arbitrary caller's working directory.
await Promise.all(['../.astro-static/','../dist/'].map(path=>
  rm(new URL(path,import.meta.url),{recursive:true,force:true})
));
