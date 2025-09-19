import unusedImports from 'eslint-plugin-unused-imports';

export default [
  {
    files: ['**/*.ts'],
    ignores: ['node_modules/**', 'dist/**', 'build/**'],
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'off',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];

