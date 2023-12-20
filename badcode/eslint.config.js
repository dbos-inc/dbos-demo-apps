//import dbos-eslint from './scan/custom_rules'

module.exports = [{
  //"extends": [
  //  "eslint:recommended",
  //  "plugin:@typescript-eslint/recommended",
  //  "plugin:@typescript-eslint/recommended-requiring-type-checking"
  //],
  "plugins": {
    //"@typescript-eslint",
    //"security",
    //"no-secrets",
    //"./scan/custom_rules.ts",
  },
  //"env": {
  //  "node": true,
  //  "es6": true
  //},
  "rules": {
    //"@typescript-eslint/explicit-function-return-type": "off",
    //"@typescript-eslint/no-inferrable-types": "off",
    //"@typescript-eslint/explicit-module-boundary-types": "off",
    //"@typescript-eslint/restrict-template-expressions": "off",
    //"@typescript-eslint/restrict-plus-operands": "off",
    //"@typescript-eslint/require-await": "off",
    //"@typescript-eslint/no-unnecessary-type-assertion": "off",
    //"@typescript-eslint/no-unsafe-member-access": "off",
    //"@typescript-eslint/no-unsafe-assignment": "off",
    //"@typescript-eslint/semi": ["error"],
    "no-eval": "error",
    //"no-console": "error",
    //"security/detect-unsafe-regex": "error",
    //"no-secrets/no-secrets": "error",

    //"@typescript-eslint/no-unused-vars": [
    //  "error",
    //  { "argsIgnorePattern": "^_",
    //    "varsIgnorePattern": "^_" }
    //],
    //"no-case-declarations": "off",
    //"@typescript-eslint/unbound-method": [
    //  "error",
    //  {
    //    "ignoreStatic": true
    //  }
    //]
  },
  //"parser": "@typescript-eslint/parser",
  //"parserOptions": {
  //  "project": "./tsconfig.json"
  //}
}];
