import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: { port: 5173, strictPort: false, allowedHosts: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        manufacturer: resolve(__dirname, "manufacturer.html"),
        gallery: resolve(__dirname, "gallery.html"),
        shop: resolve(__dirname, "shop.html"),
        tables: resolve(__dirname, "tables.html"),
        chairs: resolve(__dirname, "chairs.html"),
        checkout: resolve(__dirname, "checkout.html"),
        productDetail: resolve(__dirname, "product-detail.html"),
      },
    },
  },
});
