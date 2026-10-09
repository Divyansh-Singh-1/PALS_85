import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  
  return {
    plugins: [react(), tailwindcss()],
    test: {
      include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
      globals: false,
    },
    server: {
      proxy: {
        "/api/groq": {
          target: "https://api.groq.com/openai/v1/chat/completions",
          changeOrigin: true,
          rewrite: () => "",
          headers: {
            "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
      },
    },
  };
});
