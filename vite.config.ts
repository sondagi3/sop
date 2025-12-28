import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 8787, strictPort: true },
  plugins: [
    {
      name: "portal-rewrite",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (!req.url) return next();
          if (req.url === "/portal" || req.url === "/portal/") {
            req.url = "/portal/index.html";
          }
          next();
        });
      }
    }
  ]
});

