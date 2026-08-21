/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LogLevel } from '@adatechnology/logger'

import type { CryptographicConfiguration } from '../config/cryptographic-configuration.schema'
import type { CompanyRole, FiscalEnvironment } from '../database/database.schema'
import type { CompanyPermission } from '../identity/domain/authorization.policy'

export type ApiEnvironment = {
  readonly appEnv: string
  /** Token do primeiro acesso (ADR-0022); ausente é rota morta, nunca rota aberta. */
  readonly bootstrapToken: string | undefined
  /** Empresa do ambiente (ADR-0021); ausente mantém a rota de arranque morta (ADR-0022). */
  readonly companyId: string | undefined
  readonly cryptography: CryptographicConfiguration
  readonly databaseUrl: string
  /** Remetente compartilhado com o worker; ausente deixa o canal de e-mail sem driver. */
  readonly emailDelivery:
    | {
        readonly from: string
        readonly smtpUrl: string
      }
    | undefined
  readonly frontendOrigin: string
  readonly keycloak: {
    readonly admin: {
      readonly clientId: string
      readonly clientSecret: string
    }
    readonly audience: string
    readonly issuer: string
    readonly jwksUri: string
  }
  readonly logLevel: LogLevel
  /** Broker das entregas de notificação; ausente deixa o módulo sem fila em vez de inventar uma. */
  readonly messaging:
    | {
        readonly queuePrefix: string
        readonly url: string
      }
    | undefined
  /** Endereço público do postback de NFS-e; ausente mantém a rota anônima de callback fora do ar. */
  readonly nfseCallbackBaseUrl: string | undefined
  /** Segredo do recibo de entrega; ausente, a rota de webhook do módulo não é publicada. */
  readonly notificationWebhookSecret: string | undefined
  readonly port: number
  /**
   * Provedores públicos de CEP, consultados só quando o banco da instalação não soube o endereço
   * inteiro. Ausentes os dois, a escada para no nosso banco e o operador digita — nunca derruba boot.
   */
  readonly postalCodeProviders: {
    readonly brasilApiUrl: string | undefined
    readonly viaCepUrl: string | undefined
  }
  /** Cadência do serviço de cron, para a tela dizer quando é o próximo ciclo automático. */
  readonly scheduledDistributionCron: string
  /** Destino HTTP do log estruturado; ausente mantém só o stdout. */
  readonly logSinkUrl: string | undefined
  /** DSN do rastreio de erro; ausente desliga o rastreio em vez de derrubar o boot. */
  readonly sentryDsn: string | undefined
  readonly sentryEnvironment: string
  /** Catálogo de marca/modelo FIPE; `null` desliga o recurso — campos viram texto livre. */
  readonly vehicleCatalog: {
    /** Janela do cache em memória; `0` pede ao provedor a cada chamada. */
    readonly cacheHours: number
    readonly url: string
  } | null
}

export type DatabaseHealthPort = {
  healthCheck(): Promise<{ readonly healthy: true }>
  close(): Promise<void>
}

/** Quantas migrations da imagem ainda não constam no journal do banco. */
export type MigrationStatusPort = {
  countPending(): Promise<number>
}

export type ApiLogger = {
  error(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
}

export type RequestTimeoutPort = {
  timeout(request: Request, seconds: number): void
}

export type StoppableServer = {
  stop(): Promise<void>
}

export type HealthStatus = 'ok' | 'degraded'
export type DependencyStatus = 'up' | 'down'

type HealthResponseBase = {
  readonly service: 'api'
  readonly timestamp: string
}

export type LivenessHealthResponse = HealthResponseBase & {
  readonly status: 'ok'
}

export type ReadinessHealthResponse = HealthResponseBase & {
  readonly dependencies: {
    readonly database: DependencyStatus
    readonly identity: DependencyStatus
    /** `down` enquanto a imagem carregar migration que o banco ainda não aplicou. */
    readonly migrations: DependencyStatus
  }
  readonly status: HealthStatus
}

export type HealthResponse = LivenessHealthResponse | ReadinessHealthResponse

export type ApiErrorDetail = {
  readonly field: string
  readonly message: string
}

export type ErrorResponse = {
  readonly error: {
    readonly code: string
    readonly correlationId: string
    /** Presente só quando a validação reprovou mais de um campo — todos de uma vez. */
    readonly details?: readonly ApiErrorDetail[]
    readonly message: string
  }
}

export type AuthMeResponse = {
  readonly data: {
    readonly company: {
      /** `null` enquanto não há cadastro fiscal: a tela mostra ambiente nenhum em vez de chutar. */
      readonly fiscalEnvironment: FiscalEnvironment | null
      readonly id: string
    }
    readonly identity: {
      readonly userId: string
    }
    readonly permissions: readonly CompanyPermission[]
    readonly roles: readonly CompanyRole[]
  }
}
