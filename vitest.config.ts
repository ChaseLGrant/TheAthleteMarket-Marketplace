import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["tests/**/*.test.ts"], env: { PAYMENTS_OFF: "0", INBOUND_WEBHOOK_SECRET: "test-inbound" } },
});
