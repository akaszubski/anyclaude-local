module.exports = {
  preset: 'ts-jest',
  testEnvironment: '<rootDir>/tests/custom-test-environment.js',
  testMatch: ['**/*.test.js', '**/*.test.ts'],
  collectCoverageFrom: [
    'dist/**/*.js',
    '!dist/**/*.d.ts',
    '!dist/**/*-cli.js',
  ],
  coverageDirectory: 'coverage',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        verbatimModuleSyntax: false,
        module: 'commonjs',
        noUncheckedIndexedAccess: false,
        skipLibCheck: true,
        strict: false,
      },
      diagnostics: {
        ignoreCodes: [2352, 2741, 2339, 18048],
      }
    }]
  },
};
