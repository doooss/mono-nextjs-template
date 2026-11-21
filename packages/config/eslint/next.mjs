// Next.js app config: next core-web-vitals + typescript + shared base rules.
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import globals from 'globals';

import { baseRules, ignores } from './base.mjs';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ignores,
  ...nextVitals,
  ...nextTs,
  ...baseRules,
  {
    files: ['**/*.{spec,test}.{ts,tsx}', '**/jest.setup.*'],
    languageOptions: { globals: { ...globals.jest } },
  },
];

export default config;
