import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Three Fiber scenes update three.js objects (cameras, materials, scenes) in place every frame.
    // That is how three.js works, so the React Compiler's immutability rule doesn't apply to these files.
    files: ["app/tour/scene/**/*.tsx"],
    rules: { "react-hooks/immutability": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party bundles copied in as-is (three.js r128 and Draco decoders).
    "public/vendor/**",
    "experiments/vendor/**",
  ]),
]);

export default eslintConfig;
