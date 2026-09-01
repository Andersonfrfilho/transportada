/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type {
  CteTechnicalResponsibleEnvironment,
  MdfeAutoIssueEnvironment,
  FuelPricePullEnvironment,
  IdentityDocumentBackfillEnvironment,
  WorkerEnvironment,
} from '../shared/worker.types.js'

const TECHNICAL_RESPONSIBLE_KEYS = [
  'CTE_TECHNICAL_RESPONSIBLE_CNPJ',
  'CTE_TECHNICAL_RESPONSIBLE_CONTACT',
  'CTE_TECHNICAL_RESPONSIBLE_EMAIL',
  'CTE_TECHNICAL_RESPONSIBLE_PHONE',
] as const

const EMAIL_DELIVERY_KEYS = ['EMAIL_FROM', 'SMTP_URL'] as const

/**
 * ADR-0047: o crachá do worker para chamar a API. As quatro juntas ou nenhuma — com o endereço sem
 * o segredo, o gatilho subiria e falharia em 401 a cada CT-e autorizado, barulho sem efeito.
 */
const MDFE_AUTO_ISSUE_KEYS = [
  'API_BASE_URL',
  'KEYCLOAK_TOKEN_URL',
  'WORKER_CLIENT_ID',
  'WORKER_CLIENT_SECRET',
] as const

const DEFAULT_PROVIDER_TIMEOUT_MILLISECONDS = 15_000
const MAX_PROVIDER_TIMEOUT_MILLISECONDS = 60_000

const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const
const RABBITMQ_PROTOCOLS = ['amqp:', 'amqps:'] as const

const workerEnvironmentSchema = z
  .object({
    ANEEL_BASE_URL: optionalUrl(),
    API_BASE_URL: optionalUrl(),
    // Origem do painel: é dela que sai o desenho da Ada no rodapé do e-mail. Ausente, o rodapé
    // continua assinando — só em texto, porque imagem quebrada assina pior.
    APP_BASE_URL: optionalUrl(),
    KEYCLOAK_ADMIN_CLIENT_ID: optionalText(),
    KEYCLOAK_ADMIN_CLIENT_SECRET: optionalText(),
    KEYCLOAK_ISSUER: optionalUrl(),
    KEYCLOAK_TOKEN_URL: optionalUrl(),
    WORKER_CLIENT_ID: optionalText(),
    WORKER_CLIENT_SECRET: optionalText(),
    ANEEL_TIMEOUT_MS: providerTimeout(),
    ANP_BASE_URL: optionalUrl(),
    ANP_TIMEOUT_MS: providerTimeout(),
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
    // Spec 062 T005 — o convite e a recuperação de senha por WhatsApp. Sem segredo aqui: o token é
    // por empresa e vive selado no banco, gravado pela API. A versão da Graph API tem padrão porque
    // a Meta a exige no caminho e ela envelhece; a base existe para apontar para um mock local.
    WHATSAPP_API_VERSION: z
      .string()
      .trim()
      .regex(/^v[0-9]{1,3}\.[0-9]{1,3}$/u, { message: 'WHATSAPP_API_VERSION must look like v23.0' })
      .default('v23.0'),
    WHATSAPP_BASE_URL: optionalUrl(),
    // ⚠️ Nome do template aprovado na Meta, com o código como único parâmetro do corpo. Ausente, o
    // envio cai em texto livre — que a Meta **só aceita dentro da janela de 24 h**, e quem recebe um
    // convite nunca escreveu para o número antes. Ver o buraco declarado na evidência da T005.
    WHATSAPP_CODE_TEMPLATE_LANGUAGE: z.string().trim().min(2).max(10).default('pt_BR'),
    WHATSAPP_INVITATION_TEMPLATE: optionalText(),
    WHATSAPP_PASSWORD_RESET_TEMPLATE: optionalText(),
    QUEUE_PREFIX: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
    RABBITMQ_URL: protocolUrl(RABBITMQ_PROTOCOLS),
    /**
     * Matriz de estrada do roteirizador (ADR-0044 §2). Ausente, o consumidor não sobe: sem ela não
     * há como resolver, e um consumidor que consome e falha esvaziaria a fila marcando tudo como
     * `failed`. Melhor a mensagem esperar na fila até o serviço existir.
     */
    ROUTING_MATRIX_URL: optionalUrl(),
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

    const declaredAutoIssueKeys = MDFE_AUTO_ISSUE_KEYS.filter(
      (key) => environment[key] !== undefined,
    ).length
    if (declaredAutoIssueKeys > 0 && declaredAutoIssueKeys < MDFE_AUTO_ISSUE_KEYS.length) {
      context.addIssue({
        code: 'custom',
        message: 'The automatic MDF-e trigger requires every credential or none',
        path: [...MDFE_AUTO_ISSUE_KEYS],
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
  const identityDocumentBackfill = toIdentityDocumentBackfill(result.data)
  const mdfeAutoIssue = toMdfeAutoIssue(result.data)

  return {
    apiBaseUrl: result.data.API_BASE_URL,
    appBaseUrl: result.data.APP_BASE_URL,
    appEnv: result.data.APP_ENV,
    ...(technicalResponsible === undefined
      ? {}
      : { cteTechnicalResponsible: technicalResponsible }),
    databaseUrl: result.data.DATABASE_URL,
    fiscalEnvironment: result.data.FISCAL_ENVIRONMENT,
    fuelPricePull: toFuelPricePull(result.data),
    ...(identityDocumentBackfill === undefined ? {} : { identityDocumentBackfill }),
    ...(result.data.EMAIL_FROM === undefined || result.data.SMTP_URL === undefined
      ? {}
      : { emailDelivery: { from: result.data.EMAIL_FROM, smtpUrl: result.data.SMTP_URL } }),
    foundationSyntheticConsumerEnabled: result.data.FOUNDATION_SYNTHETIC_CONSUMER_ENABLED,
    foundationSyntheticEffectDelayMs: result.data.FOUNDATION_SYNTHETIC_EFFECT_DELAY_MS,
    logLevel: result.data.LOG_LEVEL,
    ...(mdfeAutoIssue === undefined ? {} : { mdfeAutoIssue }),
    nfseProvider: {
      baseUrl: result.data.NFSE_PROVIDER_BASE_URL,
      callbackBaseUrl: result.data.NFSE_CALLBACK_BASE_URL,
      timeoutMilliseconds: result.data.NFSE_PROVIDER_TIMEOUT_MS,
    },
    whatsapp: {
      apiVersion: result.data.WHATSAPP_API_VERSION,
      baseUrl: result.data.WHATSAPP_BASE_URL,
      codeTemplateLanguage: result.data.WHATSAPP_CODE_TEMPLATE_LANGUAGE,
      invitationTemplate: result.data.WHATSAPP_INVITATION_TEMPLATE,
      passwordResetTemplate: result.data.WHATSAPP_PASSWORD_RESET_TEMPLATE,
    },
    port: result.data.WORKER_PORT,
    prefetch: result.data.WORKER_PREFETCH,
    queuePrefix: result.data.QUEUE_PREFIX,
    rabbitMqUrl: result.data.RABBITMQ_URL,
    routingMatrixUrl: result.data.ROUTING_MATRIX_URL,
    logSinkUrl: result.data.LOG_SINK_URL,
    sentryDsn: result.data.SENTRY_DSN,
    sentryEnvironment: result.data.SENTRY_ENVIRONMENT ?? result.data.APP_ENV,
  }
}

/**
 * Duas agências, um bloco: quem decide se ele existe é a **presença** de um dos dois endereços.
 * Nenhum declarado é instalação que não coleta preço; um só derruba o boot, porque meia série
 * gravada é tela com preço sem dizer que está incompleta.
 */
function toFuelPricePull(
  data: Readonly<{
    ANEEL_BASE_URL?: string | undefined
    ANEEL_TIMEOUT_MS: number
    ANP_BASE_URL?: string | undefined
    ANP_TIMEOUT_MS: number
  }>,
): FuelPricePullEnvironment | undefined {
  if (data.ANEEL_BASE_URL === undefined && data.ANP_BASE_URL === undefined) return undefined
  if (data.ANEEL_BASE_URL === undefined || data.ANP_BASE_URL === undefined) {
    throw new WorkerConfigurationError()
  }

  return {
    aneelBaseUrl: data.ANEEL_BASE_URL,
    aneelTimeoutMilliseconds: data.ANEEL_TIMEOUT_MS,
    anpBaseUrl: data.ANP_BASE_URL,
    anpTimeoutMilliseconds: data.ANP_TIMEOUT_MS,
  }
}

/**
 * As três juntas ou nenhuma. Ausentes, a rotina de backfill não é registrada e a janela dela pousa
 * em `job_run_routine_missing` — que é a verdade: não há provedor para escrever atributo nenhum.
 * Um grupo pela metade derruba o boot, como o da agência: credencial de admin incompleta é engano
 * de configuração, não escolha de não usar.
 */
function toIdentityDocumentBackfill(
  data: Readonly<{
    KEYCLOAK_ADMIN_CLIENT_ID?: string | undefined
    KEYCLOAK_ADMIN_CLIENT_SECRET?: string | undefined
    KEYCLOAK_ISSUER?: string | undefined
  }>,
): IdentityDocumentBackfillEnvironment | undefined {
  const values = [
    data.KEYCLOAK_ADMIN_CLIENT_ID,
    data.KEYCLOAK_ADMIN_CLIENT_SECRET,
    data.KEYCLOAK_ISSUER,
  ]
  if (values.every((value) => value === undefined)) return undefined
  if (values.some((value) => value === undefined)) throw new WorkerConfigurationError()

  return {
    clientId: data.KEYCLOAK_ADMIN_CLIENT_ID as string,
    clientSecret: data.KEYCLOAK_ADMIN_CLIENT_SECRET as string,
    issuer: data.KEYCLOAK_ISSUER as string,
  }
}

/** Ausente é gatilho desligado: a instalação sem crachá continua emitindo MDF-e à mão. */
function toMdfeAutoIssue(
  data: Readonly<{
    [TKey in (typeof MDFE_AUTO_ISSUE_KEYS)[number]]?: string | undefined
  }>,
): MdfeAutoIssueEnvironment | undefined {
  const apiBaseUrl = data.API_BASE_URL
  const tokenUrl = data.KEYCLOAK_TOKEN_URL
  const clientId = data.WORKER_CLIENT_ID
  const clientSecret = data.WORKER_CLIENT_SECRET
  if (
    apiBaseUrl === undefined ||
    tokenUrl === undefined ||
    clientId === undefined ||
    clientSecret === undefined
  ) {
    return undefined
  }
  return { apiBaseUrl, clientId, clientSecret, tokenUrl }
}

function providerTimeout() {
  return z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PROVIDER_TIMEOUT_MILLISECONDS)
    .default(DEFAULT_PROVIDER_TIMEOUT_MILLISECONDS)
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
