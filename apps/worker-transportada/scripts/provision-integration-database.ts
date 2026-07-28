/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'

const INTEGRATION_DATABASE_SUFFIX = '_worker_integration'

// A integração do worker semeia reservas fiscais, que são append-only e por isso nunca podem
// ser removidas: o banco dedicado impede que esse resíduo caia no banco de desenvolvimento.
async function provisionIntegrationDatabase(): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required to provision the worker integration database')
  }

  const databaseName = `${new URL(databaseUrl).pathname.slice(1)}${INTEGRATION_DATABASE_SUFFIX}`
  const admin = new SQL(databaseUrl, { max: 1 })
  try {
    const existing = await admin.unsafe('select 1 from pg_database where datname = $1', [
      databaseName,
    ])
    if (existing.length === 0) {
      await admin.unsafe(`create database "${databaseName}"`)
    }
  } finally {
    await admin.close({ timeout: 0 })
  }

  return databaseName
}

process.stdout.write(`${await provisionIntegrationDatabase()}\n`)
