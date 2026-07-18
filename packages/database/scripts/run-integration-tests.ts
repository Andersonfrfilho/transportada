const databaseUrl = process.env.DRIZZLE_TEST_DATABASE_URL

if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DRIZZLE_TEST_DATABASE_URL is required for database integration tests')
}

const testProcess = Bun.spawn(['bun', 'test'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: process.env,
  stdout: 'inherit',
  stderr: 'inherit',
})

process.exit(await testProcess.exited)
