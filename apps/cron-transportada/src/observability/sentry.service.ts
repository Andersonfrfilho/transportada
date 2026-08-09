/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Gateway do rastreio de erro. Sem DSN tudo vira no-op — ambiente local e teste
 * não falam com serviço externo, e a ausência da variável é configuração válida,
 * não defeito.
 *
 * Todo evento passa pelo *mesmo* redator do logger antes de sair. Um rastreador
 * de erro é o destino mais provável de vazar PII: a mensagem da exceção quase
 * sempre carrega o dado que causou a falha, e é isso que a regra de segurança §1
 * proíbe. Por isso o evento inteiro vai ao redator, não só os campos que o SDK
 * chama de contexto — `message` e `exception.values[].value` vazam tanto quanto
 * `extra`.
 */
import { redactMeta } from '@adatechnology/logger'
import * as Sentry from '@sentry/bun'

/**
 * O que o SDK preenche e a denylist do logger não pega sozinha: `cookies` não
 * termina em `cookie` (o `s` quebra o casamento por sufixo) e `ip_address` é PII
 * pela LGPD sem ter forma reconhecível.
 */
const SENTRY_EXTRA_REDACTED_KEYS = ['cookies', 'ip_address'] as const

/** O cron é one-shot: sem drenar antes do `process.exit` o evento morre na fila. */
const SENTRY_FLUSH_TIMEOUT_MILLISECONDS = 2_000

export type SentryEvent = Record<string, unknown>

export type SentryInitOptions = {
  readonly beforeSend: (event: SentryEvent) => SentryEvent | null
  readonly dsn: string
  readonly environment: string
  readonly release: string
  readonly sendDefaultPii: false
  readonly tracesSampleRate: 0
}

export type SentryClientPort = {
  captureException(error: unknown): void
  flush(timeoutMilliseconds: number): Promise<void>
  init(options: SentryInitOptions): void
}

export type ErrorTrackingConfiguration = {
  readonly dsn: string | undefined
  readonly environment: string
  readonly release: string
}

export type ErrorTracker = {
  readonly enabled: boolean
  captureException(error: unknown): void
  flush(): Promise<void>
}

type CreateErrorTrackerParams = {
  readonly client?: SentryClientPort
  readonly configuration: ErrorTrackingConfiguration
}

export function scrubSentryEvent(event: SentryEvent): SentryEvent {
  return redactMeta(event, { extraKeys: [...SENTRY_EXTRA_REDACTED_KEYS] })
}

const DISABLED_TRACKER: ErrorTracker = {
  captureException(): void {
    // Sem DSN não há para onde mandar — engolir é o comportamento correto.
  },
  enabled: false,
  async flush(): Promise<void> {
    // Nada enfileirado, nada a drenar.
  },
}

/** Única fronteira com o SDK: o `ErrorEvent` dele não tem índice de string. */
const sentrySdkClient: SentryClientPort = {
  captureException(error: unknown): void {
    Sentry.captureException(error)
  },
  async flush(timeoutMilliseconds: number): Promise<void> {
    await Sentry.flush(timeoutMilliseconds)
  },
  init(options: SentryInitOptions): void {
    Sentry.init(options as unknown as Parameters<typeof Sentry.init>[0])
  },
}

export function createErrorTracker({
  client,
  configuration,
}: CreateErrorTrackerParams): ErrorTracker {
  const dsn = configuration.dsn?.trim() ?? ''
  if (dsn === '') return DISABLED_TRACKER

  const sdk = client ?? sentrySdkClient
  sdk.init({
    beforeSend: scrubSentryEvent,
    dsn,
    environment: configuration.environment,
    release: configuration.release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  })

  return {
    captureException(error: unknown): void {
      sdk.captureException(error)
    },
    enabled: true,
    async flush(): Promise<void> {
      await sdk.flush(SENTRY_FLUSH_TIMEOUT_MILLISECONDS)
    },
  }
}
