import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/next-env.d.ts'] },
  ...ts.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
