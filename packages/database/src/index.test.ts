import { afterEach, describe, expect, test } from 'bun:test'
import { DatabaseConnection } from './index.js'

const databaseUrl = process.env.DRIZZLE_TEST_DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test
const connections: DatabaseConnection[] = []

afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.close()))
})

describe('DatabaseConnection', () => {
  testWithPostgres('reports health from PostgreSQL and closes idempotently', async () => {
    const connection = new DatabaseConnection(databaseUrl!)
    connections.push(connection)

    expect(await connection.health()).toEqual({ status: 'up' })
    await connection.close()
    expect(await connection.close()).toBeUndefined()
    expect(await connection.health()).toEqual({ status: 'down' })
  })
})
