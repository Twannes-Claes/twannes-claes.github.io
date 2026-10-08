import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    // Convex writes _generated itself, see src/personal/ttrpg/README.md.
    { ignores: ['dist', 'node_modules', 'src/personal/ttrpg/convex/_generated'] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.browser,
        },
        plugins: {
            '@stylistic': stylistic,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

            // Formatting for .ts/.tsx. Prettier is excluded from these files
            // because it cannot put braces on their own line.
            '@stylistic/brace-style': ['error', 'allman', { allowSingleLine: true }],

            // A single-line body needs no braces, and sits on the next line.
            // Bodies that span several lines keep their braces.
            curly: ['error', 'multi-or-nest'],
            '@stylistic/nonblock-statement-body-position': ['error', 'below'],

            // Breathing room after declarations and around blocks.
            '@stylistic/padding-line-between-statements': [
                'error',
                { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
                { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
                { blankLine: 'always', prev: 'block-like', next: '*' },
                { blankLine: 'always', prev: '*', next: 'return' },
            ],

            '@stylistic/indent': ['error', 4, { SwitchCase: 1 }],
            '@stylistic/indent-binary-ops': ['error', 4],
            '@stylistic/jsx-indent-props': ['error', 4],
            '@stylistic/jsx-closing-bracket-location': ['error', 'tag-aligned'],
            '@stylistic/jsx-quotes': ['error', 'prefer-double'],
            '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/comma-dangle': ['error', 'always-multiline'],
            '@stylistic/object-curly-spacing': ['error', 'always'],
            '@stylistic/arrow-parens': ['error', 'always'],
            '@stylistic/eol-last': ['error', 'always'],
            '@stylistic/no-trailing-spaces': 'error',
        },
    },
);
