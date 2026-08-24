/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type {
  CteTechnicalResponsibleEnvironment,
  WorkerEnvironment,
} from '../shared/worker.types.js'

const TECHNICAL_RESPONSIBLE_KEYS = [
  'CTE_TECHNICAL_RESPONSIBLE_CNPJ',
  'CTE_TECHNICAL_RESPONSIBLE_CONTACT',
  'CTE_TECHNICAL_RESPONSIBLE_EMAIL',
  'CTE_TECHNICAL_RESPONSIBLE_PHONE',
] as const

const EMAIL_DELIVERY_KEYS = ['EMAIL_FROM', 'SMTP_URL'] as const

const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const
const RABBITMQ_PROTOCOLS = ['amqp:', 'amqps:'] as const

const workerEnvironmentSchema = z
  .object({
    APP_ENV: z.string().trim().min(1).default('local'),
    // infRespTec: as quatro juntas ou nenhuma — grupo incompleto é rejeição na SEFAZ.
    CTE_TECHNICAL_RESPONSIBLE_CNPJ: z.string().trim().min(1).optional(),
    CTE_TECHNICAL_RESPONSIBLE_CONTACT: z.string().trim().min(1).optional(),
    CTE_TECHNICAL_RESPONSIBLE_EMAIL: z.string().trim().email().optional(),
    CTE_TECHNICAL_RESPONSIBLE_PHONE: z.string().trim().min(1).optional(),
    DATABASE_URL: protocolUrl(POSTGRESQL_PROTOCOLS),
    // Produção é o padrão: a NFS-e é trilho de produção (ADR-0035), e instalação de homologação
    // declara o ambiente explicitamente, como o cron sempre fez.
    FISCAL_ENVIRONMENT: z.enum(['homologation', 'production']).default('production'),
    // Remetente e conexão juntos ou nenhum: com um só, o convite sai sem canal e o código morre
    // selado na linha do convite.
    EMAIL_FROM: optionalText(),
    FOUNDATION_SYNTHETIC_CONSUMER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    FOUNDATION_SYNTHETIC_EFFECT_DELAY_MS: z.coerce.number().int().min(0).max(30_000).default(0),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    // Endereço público desta instalação, de onde sai a `CallbackUrl` obrigatória do `/emitir`. É a
    // mesma variável que a API usa para registrar a rota do postback — configurar uma sem a outra é
    // emitir sem retorno ou publicar rota que ninguém chama. Não é segredo: o segredo é o token
    // opaco por empresa, que vive selado no envelope da credencial.
    NFSE_CALLBACK_BASE_URL: optionalTrustedUrl('NFSE_CALLBACK_BASE_URL'),
    // Um endereço só: a Nota RP publica um servidor, e é o de produção (ADR-0035).
    NFSE_PROVIDER_BASE_URL: optionalUrl(),
    NFSE_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
    QUEUE_PREFIX: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
    RABBITMQ_URL: protocolUrl(RABBITMQ_PROTOCOLS),
    LOG_SINK_URL: optionalUrl(),
    SENTRY_DSN: optionalUrl(),
    SMTP_URL: optionalUrl(),
    SENTRY_ENVIRONMENT: optionalText(),
    WORKER_PORT: z.coerce.number().int().min(0).max(65_535).default(53_002),
    WORKER_PREFETCH: z.coerce.number().int().min(1).max(100).default(1),
  })
  .superRefine((environment, context) => {
    const declared = TECHNICAL_RESPONSIBLE_KEYS.filter(
      (key) => environment[key] !== undefined,
    ).length
    if (declared > 0 && declared < TECHNICAL_RESPONSIBLE_KEYS.length) {
      context.addIssue({
        code: 'custom',
        message: 'The technical responsible requires every field or none',
        path: [...TECHNICAL_RESPONSIBLE_KEYS],
      })
    }

    const declaredEmailKeys = EMAIL_DELIVERY_KEYS.filter(
      (key) => environment[key] !== undefined,
    ).length
    if (declaredEmailKeys > 0 && declaredEmailKeys < EMAIL_DELIVERY_KEYS.length) {
      context.addIssue({
        code: 'custom',
        message: 'Email delivery requires both the sender and the SMTP connection or none',
        path: [...EMAIL_DELIVERY_KEYS],
      })
    }

    if (environment.APP_ENV === 'production' && environment.FOUNDATION_SYNTHETIC_CONSUMER_ENABLED) {
      context.addIssue({
        code: 'custom',
        message: 'The foundation synthetic consumer is forbidden in production',
        path: ['FOUNDATION_SYNTHETIC_CONSUMER_ENABLED'],
      })
    }
  })

export class WorkerConfigurationError extends Error {
  override readonly name = 'WorkerConfigurationError'

  constructor() {
    super('Invalid worker environment configuration')
  }
}

export function parseWorkerEnvironment(
  environment: Record<string, string | undefined>,
): WorkerEnvironment {
  const result = workerEnvironmentSchema.safeParse(environment)
  if (!result.success) {
    throw new WorkerConfigurationError()
  }

  const technicalResponsible = toTechnicalResponsible(result.data)

  return {
    appEnv: result.data.APP_ENV,
    ...(technicalResponsible === undefined
      ? {}
      : { cteTechnicalResponsible: technicalResponsible }),
    databaseUrl: result.data.DATABASE_URL,
    fiscalEnvironment: result.data.FISCAL_ENVIRONMENT,
    ...(result.data.EMAIL_FROM === undefined || result.data.SMTP_URL === undefined
      ? {}
      : { emailDelivery: { from: result.data.EMAIL_FROM, smtpUrl: result.data.SMTP_URL } }),
    foundationSyntheticConsumerEnabled: result.data.FOUNDATION_SYNTHETIC_CONSUMER_ENABLED,
    foundationSyntheticEffectDelayMs: result.data.FOUNDATION_SYNTHETIC_EFFECT_DELAY_MS,
    logLevel: result.data.LOG_LEVEL,
    nfseProvider: {
      baseUrl: result.data.NFSE_PROVIDER_BASE_URL,
      callbackBaseUrl: result.data.NFSE_CALLBACK_BASE_URL,
      timeoutMilliseconds: result.data.NFSE_PROVIDER_TIMEOUT_MS,
    },
    port: result.data.WORKER_PORT,
    prefetch: result.data.WORKER_PREFETCH,
    queuePrefix: result.data.QUEUE_PREFIX,
    rabbitMqUrl: result.data.RABBITMQ_URL,
    logSinkUrl: result.data.LOG_SINK_URL,
    sentryDsn: result.data.SENTRY_DSN,
    sentryEnvironment: result.data.SENTRY_ENVIRONMENT ?? result.data.APP_ENV,
  }
}

/**
 * Como `optionalUrl`, mas só aceita https — ou http em localhost, para o ambiente de máquina. A v2
 * exige callback https e suspende a integração de quem publica endereço que não responde; http em
 * domínio público é o caminho mais curto para a suspensão. Mesma regra da API, por valor.
 */
function optionalTrustedUrl(key: string): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || isTrustedCallbackUrl(value), {
      message: `${key} must be an HTTPS URL or an HTTP localhost URL`,
    })
    .optional()
}

function isTrustedCallbackUrl(value: string): boolean {
  return (
    /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[^\s]*)?$/.test(value) ||
    /^http:\/\/localhost(?::\d{1,5})?(?:\/[^\s]*)?$/.test(value)
  )
}

/** Vazio é o padrão e significa desligado; preenchido e torto falha o boot. */
function optionalUrl(): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || URL.canParse(value), {
      message: 'Invalid URL',
    })
    .optional()
}

function toTechnicalResponsible(
  data: Readonly<{
    [TKey in (typeof TECHNICAL_RESPONSIBLE_KEYS)[number]]?: string | undefined
  }>,
): CteTechnicalResponsibleEnvironment | undefined {
  const cnpj = data.CTE_TECHNICAL_RESPONSIBLE_CNPJ
  const xContato = data.CTE_TECHNICAL_RESPONSIBLE_CONTACT
  const email = data.CTE_TECHNICAL_RESPONSIBLE_EMAIL
  const fone = data.CTE_TECHNICAL_RESPONSIBLE_PHONE
  if (cnpj === undefined || xContato === undefined || email === undefined || fone === undefined) {
    return undefined
  }
  return { cnpj, email, fone, xContato }
}

function protocolUrl<const TProtocols extends readonly string[]>(
  protocols: TProtocols,
): z.ZodString {
  return z
    .string()
    .url()
    .refine((value) => protocols.includes(new URL(value).protocol), {
      message: 'Unsupported connection protocol',
    })
}

/** Declarada e vazia é ausência: o `.env.example` escreve o padrão desligado sem derrubar o boot. */
function optionalText(): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional()
}
