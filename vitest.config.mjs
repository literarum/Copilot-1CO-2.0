export default {
  test: {
    include: ['site/js/**/*.test.js', 'api/**/*.test.js', 'yandex-function/**/*.test.js'],
    globals: true,
    environment: 'node'
  }
}

