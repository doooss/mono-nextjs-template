// Shared base rules: import sorting + prettier as a lint rule.
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

/** @type {import('eslint').Linter.Config[]} */
export const baseRules = [
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  eslintPluginPrettierRecommended,
];

export const ignores = {
  ignores: [
    '**/node_modules/**',
    // 패키지 루트 기준 (eslint 는 각 패키지에서 실행) — src 아래 같은 이름의 라우트 폴더는 lint 대상
    '.next/**',
    '**/.turbo/**',
    'dist/**',
    'out/**',
    'build/**',
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
    '**/next-env.d.ts',
  ],
};
