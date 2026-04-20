import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    cors: true,
  },

  build: {
    outDir: "../www/sprinklerv2",
    emptyOutDir: true,

    rollupOptions: {
      input: {
        "sprinklerv2-timeline-card": resolve(__dirname, "src/sprinklerv2-timeline-card.js"),
        "sprinklerv2-zones-card-v2": resolve(__dirname, "src/sprinklerv2-zones-card-v2.js"),
        "sprinklerv2-programs-card-v2": resolve(__dirname, "src/sprinklerv2-programs-card-v2.js"),
        "sprinklerv2-eto-card": resolve(__dirname, "src/sprinklerv2-eto-card.js"),
      },

      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        format: "es",
        manualChunks: undefined
      },
    },
  },
});