import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function removeCrossorigin(): Plugin {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '');
    }
  };
}

export default defineConfig({
  plugins: [react(), removeCrossorigin()],
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  define: {
    'process.env.HOME': JSON.stringify(process.env.HOME || ''),
    'process.env.USERPROFILE': JSON.stringify(process.env.USERPROFILE || ''),
    'process.platform': JSON.stringify(process.platform),
  }
});
