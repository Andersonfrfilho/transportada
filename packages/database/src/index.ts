import type { DrizzleProvider } from '@adatechnology/drizzle-provider'

export { databaseSchema } from './schema.js'

export interface DatabaseHealth {
  readonly status: 'up' | 'down'
}

export class DatabaseConnection {
  private provider: Promise<DrizzleProvider> | undefined

  public constructor(private readonly connectionString: string) {}

  public async health(): Promise<DatabaseHealth> {
    try {
      await (await this.getProvider()).healthCheck()
      return { status: 'up' }
    } catch {
      return { status: 'down' }
    }
  }

  public async close(): Promise<void> {
    if (this.provider !== undefined) {
      await (await this.provider).close()
    }
  }

  private getProvider(): Promise<DrizzleProvider> {
    this.provider ??= import('@adatechnology/drizzle-provider').then(({ createDrizzleProvider }) =>
      createDrizzleProvider({
        connection: {
          url: this.connectionString,
          adapter: 'postgres',
          connectionTimeout: 2,
          idleTimeout: 10,
          max: 5,
        },
      }),
    )

    return this.provider
  }
}
