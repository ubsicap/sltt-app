module.exports = {
  root: true,
  env: {
    browser: true,
    commonjs: true,
    es6: true,
    node: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true
    },
    sourceType: 'module',
    ecmaVersion: 2021
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:prettier/recommended'
  ],
  rules: {
    '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-implicit-any-catch': ['error', {
      allowExplicitAny: false
    }],
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    'no-unused-vars': ['error', { 'args': 'none' }],
    '@typescript-eslint/no-unnecessary-condition': ['error', {
      allowExplicitAny: false
    }],
    '@typescript-eslint/strict-boolean-expressions': ['error', {
      allowNullableObject: false,
      allowNullableBoolean: false,
      allowNullableString: false,
      allowNullableNumber: false,
      allowAny: false
    }]
  },
  overrides: [
    {
      files: ['*.js'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off'
      }
    }
  ]
}
