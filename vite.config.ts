import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    // このテンプレート内の tsconfig だけを読む（ネストした別リポジトリを走査しない）
    tsconfigPaths({
      projects: ["tsconfig.json", "tsconfig.cloudflare.json", "tsconfig.node.json"],
    }),
  ],
});
