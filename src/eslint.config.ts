import unusedImports from 'eslint-plugin-unused-imports';

export default [
  {
    files: ['**/*.ts'],
    ignores: ['node_modules/**', 'dist/**', 'build/**'],
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'no-unused-vars': 'off', // désactive la règle de base
      'unused-imports/no-unused-imports': 'error', // supprime les imports non utilisés
      'unused-imports/no-unused-vars': ['off', { 
        vars: 'all', 
        args: 'after-used', 
        ignoreRestSiblings: true 
      }],
    },
  },
];