// @ts-check
import eslint from '@eslint/js';
import eslintPluginNoRelativeImportPaths from 'eslint-plugin-no-relative-import-paths';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginUnusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// eslint-plugin-no-relative-import-paths@1.6.1 (latest) still calls the
// context methods ESLint 10 removed. This project is on ESLint 10, so re-expose
// them over their replacements until the plugin ships an ESLint 10 build.
const noRelativeImportPathsRule =
  eslintPluginNoRelativeImportPaths.rules['no-relative-import-paths'];
const noRelativeImportPaths = {
  ...eslintPluginNoRelativeImportPaths,
  rules: {
    'no-relative-import-paths': {
      ...noRelativeImportPathsRule,
      create: (context) =>
        noRelativeImportPathsRule.create(
          Object.create(context, {
            getCwd: { value: () => context.cwd },
            getFilename: { value: () => context.filename },
            getPhysicalFilename: { value: () => context.physicalFilename },
            getSourceCode: { value: () => context.sourceCode },
          }),
        ),
    },
  },
};

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      'unused-imports': eslintPluginUnusedImports,
      'no-relative-import-paths': noRelativeImportPaths,
    },
    rules: {
      'no-relative-import-paths/no-relative-import-paths': [
        'warn',
        { allowSameFolder: true, rootDir: 'src', prefix: '@' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
