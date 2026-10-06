import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),plugins:[react()],build:{outDir:fileURLToPath(new URL('../../dist/web',import.meta.url)),emptyOutDir:true},server:{host:'0.0.0.0',proxy:{'/api':'http://127.0.0.1:3000','/health':'http://127.0.0.1:3000','/version':'http://127.0.0.1:3000'}}});
