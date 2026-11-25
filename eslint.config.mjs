import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default [
  {
    files: ['src/**/*.{ts,tsx}', 'gateway/{src,test}/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      'no-debugger': 'error',
      'no-unreachable': 'error',
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
    },
  },
];
