/* eslint-env node */
module.exports = {
  extends: [
    'plugin:@dbos-inc/dbosRecommendedConfig',
  ],
  parser: '@typescript-eslint/parser',
  //"parserOptions": { "project": ["./tsconfig.json"] },
  plugins: ['@dbos-inc'],
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  root: true,
  ignorePatterns: ['dist/'],
  overrides: [
    {
      files: ['*.js'],
      extends: ['plugin:@typescript-eslint/disable-type-checked'],
    },
  ],
  rules: {
    'indent': ['error', 2],
  },
  "env": {
    "node": true
  },
};
