import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

export default [
    {
        ignores: ['node_modules/**', 'dist/**', 'build/**'],
    },
    ...compat.config({
        env: {
            browser: true,
            es2021: true,
            worker: true,
        },
        extends: ['eslint:recommended'],
        parserOptions: {
            ecmaVersion: 2021,
            sourceType: 'module',
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-undef': 'error',
            'no-console': 'off',
        },
        overrides: [
            {
                files: ['api/**/*.js'],
                env: { node: true },
            },
        ],
    }),
];
