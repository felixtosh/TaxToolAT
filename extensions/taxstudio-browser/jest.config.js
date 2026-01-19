/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["./__tests__/setup.js"],
  testMatch: ["**/__tests__/**/*.test.js"],
  moduleFileExtensions: ["js"],
  collectCoverageFrom: [
    "lib/**/*.js",
    "!**/node_modules/**"
  ],
  coverageDirectory: "coverage",
  verbose: true
};
