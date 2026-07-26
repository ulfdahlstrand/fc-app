// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow unused vars prefixed with _ (common TS pattern)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // The UI layer is shadcn/ui + Tailwind (ADR-007). MUI/Emotion were
      // removed; block them from creeping back in.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mui/*", "@emotion/*"],
              message:
                "Material UI/Emotion were removed (ADR-007). Use shadcn/ui components in @/components/ui and Tailwind instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // Generated files and build output — skip linting
    ignores: ["src/route-tree.gen.ts", "dist/**", "node_modules/**"],
  }
);
