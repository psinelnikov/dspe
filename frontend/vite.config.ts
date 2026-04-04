import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/tee': {
        target: 'http://localhost:6676',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tee/, ''),
      },
      '/rpc': {
        target: 'https://coston2-api.flare.network/ext/C/rpc',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, ''),
        secure: false,
      },
    },
  },
});
