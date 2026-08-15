/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LogLevel } from '@adatechnology/logger'

/** infRespTec — quem desenvolveu o sistema emissor, declarado por instalação. */
export type CteTechnicalResponsibleEnvironment = {
  readonly cnpj: string
  readonly email: string
  readonly fone: string
  readonly xContato: string
}

/** Remetente e conexão SMTP da instalação — em dev aponta para o Mailpit do `docker-compose.yml`. */
export type EmailDeliveryEnvironment = {
  readonly from: string
  readonly smtpUrl: string
}

/**
 * O endereço da Nota RP é da instalação, e é um só — o provedor publica um servidor, o de produção
 * (ADR-0035). Ausente significa provedor não contratado: o trilho continua subindo e drenando, e a
 * tentativa registra a causa própria em vez de bater numa URL vazia.
 */
export type NfseProviderEnvironment = {
  readonly baseUrl: string | undefined
  readonly timeoutMilliseconds: number
}

export type WorkerEnvironment = {
  readonly appEnv: string
  readonly cteTechnicalResponsible?: CteTechnicalResponsibleEnvironment
  readonly databaseUrl: string
  /** Ausente desliga a entrega por e-mail: o convite é criado, mas o código não sai daqui. */
  readonly emailDelivery?: EmailDeliveryEnvironment
  readonly nfseProvider: NfseProviderEnvironment
  readonly foundationSyntheticConsumerEnabled: boolean
  readonly foundationSyntheticEffectDelayMs: number
  readonly logLevel: LogLevel
  readonly port: number
  readonly prefetch: number
  readonly queuePrefix: string
  readonly rabbitMqUrl: string
  /** Destino HTTP do log estruturado; ausente mantém só o stdout. */
  readonly logSinkUrl: string | undefined
  readonly sentryDsn: string | undefined
  readonly sentryEnvironment: string
}

export type HealthDependencyPort = {
  healthCheck(): Promise<{ readonly healthy: true }>
}

export type DatabasePort = HealthDependencyPort & {
  close(): Promise<void>
}

export type RabbitMqPort = DatabasePort

export type WorkerLogger = {
  error(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
}

export type DependencyStatus = 'up' | 'down'

export type WorkerHealthResponse = {
  readonly service: 'worker'
  readonly status: 'ok' | 'degraded'
  readonly timestamp: string
  readonly dependencies?: {
    readonly database: DependencyStatus
    readonly rabbitmq: DependencyStatus
    readonly storage: DependencyStatus
  }
}

export type RequestTimeoutPort = {
  timeout(request: Request, seconds: number): void
}

export type StoppableHealthServer = {
  stop(): Promise<void>
}
