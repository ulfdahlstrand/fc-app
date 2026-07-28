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
      // ADR-007: the UI layer is shadcn/ui + Tailwind. Block MUI/Emotion so the
      // removed dependency cannot creep back in after the migration (#37).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mui/*", "@emotion/*"],
              message:
                "MUI/Emotion were removed in ADR-007. Use shadcn/ui components in src/components/ui instead.",
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
