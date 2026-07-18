import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { parseEnvironment } from '@transportada/config'
import { correlationIdMiddleware, createLogger } from '@transportada/observability'
import type { Application } from 'express'
import { AppModule } from './app.module.js'

export async function bootstrap(): Promise<void> {
  const env = parseEnvironment(process.env)
  const logger = createLogger('transportada-api', env.LOG_LEVEL)
  const app = await NestFactory.create(AppModule, { logger: false })

  const expressApplication = app.getHttpAdapter().getInstance() as unknown as Application
  expressApplication.disable('x-powered-by')
  app.use(correlationIdMiddleware(logger))
  app.enableShutdownHooks()

  await app.listen(env.APP_PORT, '0.0.0.0')
  logger.info({ port: env.APP_PORT, environment: env.APP_ENV }, 'api_started')
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap()
}
