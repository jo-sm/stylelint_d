module.exports = {
  clearMocks: true,
  testEnvironment: "node",
  transform: {
    "^.+\\.(t|j)s?$": "@swc/jest",
  },
};
