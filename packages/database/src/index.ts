import { Pool } from 'pg'

export interface DatabaseHealth {
  readonly status: 'up' | 'down'
}

export class DatabaseConnection {
  private readonly pool: Pool

  public constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 10_000,
    })
  }

  public async health(): Promise<DatabaseHealth> {
    try {
      await this.pool.query('SELECT 1')
      return { status: 'up' }
    } catch {
      return { status: 'down' }
    }
  }

  public async close(): Promise<void> {
    await this.pool.end()
  }
}
