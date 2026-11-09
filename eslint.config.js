import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', '.superpowers'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'src/core must stay free of UI libraries.' },
            { group: ['**/render', '**/render/*', '**/app', '**/app/*'], message: 'src/core must not import from src/render or src/app.' },
          ],
        },
      ],
    },
  },
);
