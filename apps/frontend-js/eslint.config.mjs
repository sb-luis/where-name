import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Allows `const { unwanted: _, ...rest } = obj` to omit a key from a
      // rest-spread without flagging the now-unused `_` binding — there's no
      // other syntax to exclude a key from `...rest` in JS/TS.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
  {
    // react-three-fiber's camera control is imperative-mutation-based by
    // design (mutating the object returned by useThree() in event handlers
    // and imperative-handle methods is r3f's normal, documented pattern).
    // react-hooks/immutability has no awareness of r3f's model and flags
    // this as if it were plain React state mutation. 
    files: [
      "src/components/multiplayer/MultiplayerGlobe.tsx",
      "src/components/multiplayer/ExploreGlobe.tsx",
    ],
    rules: {
      "react-hooks/immutability": "off",
    },
  },
]);

export default eslintConfig;
