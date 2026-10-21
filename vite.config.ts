import { defineConfig } from "vite";

export default defineConfig({
  // 之後包 APK 時用相對路徑載入資源
  base: "./",
  build: { target: "es2020" },
});
