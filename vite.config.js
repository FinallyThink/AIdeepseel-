import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  plugins:[{name:'studio-dev-csp',apply:'serve',transformIndexHtml(html){
    return html.replace("connect-src 'none'", "connect-src 'self' ws://127.0.0.1:5173");
  }}],
  build: { outDir: 'dist', emptyOutDir: true }
});
