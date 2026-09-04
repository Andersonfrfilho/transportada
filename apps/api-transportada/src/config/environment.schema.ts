/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { ApiEnvironment } from '../shared/api.types'
import { parseCryptographicConfiguration } from './cryptographic-configuration.schema'

const POSTGRESQL_PROTOCOLS = ['postgres:', 'postgresql:'] as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Vazio é o padrão e significa desligado; preenchido e torto derruba o boot. */
function optionalUrl(name: string): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || URL.canParse(value), {
      message: `${name} must be a valid URL`,
    })
    .optional()
}

/** Declarada e vazia é ausência: o `.env.example` escreve o padrão desligado sem derrubar o boot. */
function optionalText(): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional()
}

const environmentSchema = z.object({
  APP_ENV: z.string().trim().min(1).default('local'),
  APP_PORT: z.coerce.number().int().min(0).max(65_535).default(53_001),
  // Não declarar é a forma de manter a rota de arranque morta; declarar em branco é engano de
  // configuração e derruba o boot. Nunca `.trim()`: espaço faz parte do segredo comparado.
  BOOTSTRAP_TOKEN: z
    .string()
    .refine((value) => value.trim() !== '', { message: 'BOOTSTRAP_TOKEN must not be blank' })
    .optional(),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) =>
        POSTGRESQL_PROTOCOLS.includes(
          new URL(value).protocol as (typeof POSTGRESQL_PROTOCOLS)[number],
        ),
      {
        message: 'DATABASE_URL must use PostgreSQL',
      },
    ),
  // Lista separada por vírgula: painel e landing são origens diferentes e as duas precisam de CORS.
  // Cada uma valida sozinha — uma origem torta na lista não pode abrir a porta pras outras.
  FRONTEND_ORIGIN: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ''),
    )
    .refine((origins) => origins.length > 0, { message: 'FRONTEND_ORIGIN must not be blank' })
    .refine((origins) => origins.every(isTrustedFrontendOrigin), {
      message:
        'FRONTEND_ORIGIN must be a comma-separated list of canonical HTTPS origins or HTTP localhost origins',
    })
    .transform((origins) => origins as [string, ...string[]]),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().trim().min(1),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().trim().min(1),
  KEYCLOAK_AUDIENCE: z.string().trim().min(1),
  KEYCLOAK_ISSUER: z.string().refine(isTrustedIdentityUrl, {
    message: 'KEYCLOAK_ISSUER must be an HTTPS URL or an HTTP localhost URL',
  }),
  KEYCLOAK_JWKS_URI: z.string().refine(isTrustedIdentityUrl, {
    message: 'KEYCLOAK_JWKS_URI must be an HTTPS URL or an HTTP localhost URL',
  }),
  // Ausente mantém a rota de arranque morta (ADR-0022) — a empresa do ambiente é opcional aqui.
  PROVISION_COMPANY_ID: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || UUID_PATTERN.test(value), {
      message: 'PROVISION_COMPANY_ID must be a valid UUID',
    })
    .optional(),
  // Marca e modelo da FIPE mudam em escala de mês, daí o padrão de trinta dias. Zero desliga o
  // cache — é a saída para depurar contra o provedor de verdade, e não contra a memória do processo.
  FLEET_VEHICLE_CATALOG_CACHE_HOURS: z.coerce.number().int().min(0).max(8_760).default(720),
  // Sem token: a BrasilAPI que espelha a tabela FIPE é pública.
  FLEET_VEHICLE_CATALOG_URL: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || isTrustedLookupUrl(value), {
      message: 'FLEET_VEHICLE_CATALOG_URL must be an HTTPS URL or an HTTP localhost URL',
    })
    .optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // Endereço público desta instalação, por onde a prefeitura devolve o postback de NFS-e. Vazio
  // significa callback não publicado, e aí a rota anônima nem é registrada. Não é segredo — o
  // segredo é o token opaco por empresa, que vive no banco e nunca sai em variável de ambiente.
  NFSE_CALLBACK_BASE_URL: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || isTrustedLookupUrl(value), {
      message: 'NFSE_CALLBACK_BASE_URL must be an HTTPS URL or an HTTP localhost URL',
    })
    .optional(),
  // Endereço público desta instalação, usado para publicar no provedor de identidade a URL da foto
  // de perfil. Não é adivinhável a partir do request: atrás de proxy o `Host` é o do proxy, e o
  // realm guardaria um endereço interno que ninguém alcança. Vazio significa foto gravada aqui e
  // atributo não escrito — a tela continua mostrando o avatar.
  API_PUBLIC_URL: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || isTrustedLookupUrl(value), {
      message: 'API_PUBLIC_URL must be an HTTPS URL or an HTTP localhost URL',
    })
    .optional(),
  // Terceiro degrau da busca de CEP: só é consultado quando o banco da instalação não soube o
  // endereço inteiro. Vazio desliga aquele provedor — os dois vazios deixam a escada terminar em
  // casa, e o operador digita. Nenhum dos dois pede token: BrasilAPI e ViaCEP são públicos.
  POSTAL_CODE_BRASIL_API_URL: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || isTrustedLookupUrl(value), {
      message: 'POSTAL_CODE_BRASIL_API_URL must be an HTTPS URL or an HTTP localhost URL',
    })
    .optional(),
  POSTAL_CODE_VIA_CEP_URL: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || isTrustedLookupUrl(value), {
      message: 'POSTAL_CODE_VIA_CEP_URL must be an HTTPS URL or an HTTP localhost URL',
    })
    .optional(),
  // O mesmo remetente do worker (ADR-0031): não se cria segunda configuração de SMTP. As duas
  // juntas ou nenhuma — meia configuração daria envio sem remetente.
  EMAIL_FROM: optionalText(),
  // Segredo compartilhado com o provedor de entrega, para o recibo. Ausente, a rota de webhook nem
  // é publicada pelo módulo: sem com o que verificar assinatura, aceitar corpo seria aceitar
  // qualquer um dizendo que a mensagem chegou.
  NOTIFICATION_WEBHOOK_SECRET: optionalText(),
  // Segredo do Cloudflare Turnstile para a candidatura pública de agregado. Ausente, a rota aceita
  // sem verificar (dev local, onde não dá pra resolver o desafio contra a API real do Cloudflare) —
  // em produção configurar é o que fecha a porta pra submissão automatizada em massa.
  TURNSTILE_SECRET_KEY: optionalText(),
  /**
   * Spec 069, degrau 2 da escada: a precisão fina, comprada **só quando um humano marca** a parada
   * como errada. Vazia, a marca responde que a precisão fina não está disponível e oferece o pino
   * manual — nada quebra, e o produto segue roteirizando com precisão de CEP.
   *
   * ⚠️ Nunca com prefixo `VITE_`: o Vite inlina o literal no bundle (`security.md` §4).
   */
  GOOGLE_MAPS_API_KEY: optionalText(),
  // Assina o access token da conta do agregado (`@adatechnology/user-module`, 064/T1) — schema
  // isolado, sem relação com o JWT do Keycloak. Ausente, o módulo não é montado: a conta do
  // agregado ainda não existe como rota, em vez de subir com segredo vazio.
  USER_ACCESS_TOKEN_SECRET: optionalText(),
  // Serviço de OCR self-hosted (Tesseract, sem chave) que lê CNH/CRLV pra pré-preencher e conferir
  // contra o declarado. Ausente, o upload nunca extrai nem aprova sozinho — só revisão manual.
  AGGREGATE_DOCUMENT_OCR_URL: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || isTrustedLookupUrl(value), {
      message: 'AGGREGATE_DOCUMENT_OCR_URL must be an HTTPS URL or an HTTP localhost URL',
    })
    .optional(),
  // Spec 062: a Graph API da Meta. Sem segredo aqui — o token é por empresa e vive selado no banco.
  // A versão tem padrão porque a Meta a exige no caminho e ela envelhece; a base existe para apontar
  // para um mock local em dev, e ausente significa a Graph API de verdade.
  WHATSAPP_API_VERSION: z
    .string()
    .trim()
    .regex(/^v[0-9]{1,3}\.[0-9]{1,3}$/u, { message: 'WHATSAPP_API_VERSION must look like v23.0' })
    .default('v23.0'),
  /**
   * Spec 062 T006 — os dois segredos do **aplicativo** da Meta, e por isso variáveis de ambiente,
   * não linhas por empresa: um app da Meta assina o webhook de **todos** os números que ele
   * administra, e o verify token é da assinatura do webhook, que também é do app. O que é por
   * empresa é o token de acesso do número, e esse continua selado no banco.
   *
   * Fail-closed por ausência: sem os dois, a rota do webhook **não é registrada** — publicar uma
   * rota pública que aceita qualquer corpo é pior que não ter webhook.
   */
  WHATSAPP_APP_SECRET: optionalText(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: optionalText(),
  WHATSAPP_BASE_URL: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || isTrustedLookupUrl(value), {
      message: 'WHATSAPP_BASE_URL must be an HTTPS URL or an HTTP localhost URL',
    })
    .optional(),
  // Par compartilhado com o worker: o prefixo nomeia a trilha do ambiente, e sem os dois o módulo
  // fica sem broker. Opcional para o ambiente de teste subir sem RabbitMQ.
  QUEUE_PREFIX: optionalText(),
  /**
   * O `/route` do OSRM, para desenhar a linha da estrada no mapa da viagem (spec 079).
   *
   * ⚠️ Validado como **infraestrutura**, não como provedor de consulta: é o mesmo serviço que o
   * worker usa para a matriz, na rede interna da instalação (`http://osrm.railway.internal:5000`),
   * e `isTrustedLookupUrl` — que exige HTTPS ou localhost — o recusaria. A regra estrita existe
   * para onde vai dado vindo do usuário; aqui saem coordenadas que a própria API calculou, para um
   * endereço que só o operador configura.
   *
   * Vazio é o padrão: sem ele o mapa desenha o que já desenha hoje, linhas retas entre as paradas,
   * e diz na tela que são retas.
   */
  ROUTING_MATRIX_URL: optionalUrl('ROUTING_MATRIX_URL'),
  RABBITMQ_URL: optionalText(),
  SMTP_URL: optionalUrl('SMTP_URL'),
  LOG_SINK_URL: optionalUrl('LOG_SINK_URL'),
  SENTRY_DSN: optionalUrl('SENTRY_DSN'),
  SENTRY_ENVIRONMENT: optionalText(),
})

export function parseEnvironment(environment: Record<string, string | undefined>): ApiEnvironment {
  const parsed = environmentSchema.parse(environment)
  const cryptography = parseCryptographicConfiguration(environment)

  return {
    appEnv: parsed.APP_ENV,
    bootstrapToken: parsed.BOOTSTRAP_TOKEN,
    companyId: parsed.PROVISION_COMPANY_ID,
    cryptography,
    databaseUrl: parsed.DATABASE_URL,
    emailDelivery:
      parsed.EMAIL_FROM === undefined || parsed.SMTP_URL === undefined
        ? undefined
        : { from: parsed.EMAIL_FROM, smtpUrl: parsed.SMTP_URL },
    frontendOrigins: parsed.FRONTEND_ORIGIN,
    keycloak: {
      admin: {
        clientId: parsed.KEYCLOAK_ADMIN_CLIENT_ID,
        clientSecret: parsed.KEYCLOAK_ADMIN_CLIENT_SECRET,
      },
      audience: parsed.KEYCLOAK_AUDIENCE,
      issuer: parsed.KEYCLOAK_ISSUER,
      jwksUri: parsed.KEYCLOAK_JWKS_URI,
    },
    logLevel: parsed.LOG_LEVEL,
    messaging:
      parsed.QUEUE_PREFIX === undefined || parsed.RABBITMQ_URL === undefined
        ? undefined
        : { queuePrefix: parsed.QUEUE_PREFIX, url: parsed.RABBITMQ_URL },
    apiPublicUrl: parsed.API_PUBLIC_URL,
    nfseCallbackBaseUrl: parsed.NFSE_CALLBACK_BASE_URL,
    notificationWebhookSecret: parsed.NOTIFICATION_WEBHOOK_SECRET,
    turnstileSecretKey: parsed.TURNSTILE_SECRET_KEY,
    googleMapsApiKey: parsed.GOOGLE_MAPS_API_KEY,
    userAccessTokenSecret: parsed.USER_ACCESS_TOKEN_SECRET,
    aggregateDocumentOcrUrl: parsed.AGGREGATE_DOCUMENT_OCR_URL,
    whatsapp: {
      apiVersion: parsed.WHATSAPP_API_VERSION,
      baseUrl: parsed.WHATSAPP_BASE_URL,
      ...(parsed.WHATSAPP_APP_SECRET === undefined ||
      parsed.WHATSAPP_WEBHOOK_VERIFY_TOKEN === undefined
        ? {}
        : {
            webhook: {
              appSecret: parsed.WHATSAPP_APP_SECRET,
              verifyToken: parsed.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
            },
          }),
    },
    port: parsed.APP_PORT,
    routingMatrixUrl: parsed.ROUTING_MATRIX_URL,
    postalCodeProviders: {
      brasilApiUrl: parsed.POSTAL_CODE_BRASIL_API_URL,
      viaCepUrl: parsed.POSTAL_CODE_VIA_CEP_URL,
    },
    logSinkUrl: parsed.LOG_SINK_URL,
    sentryDsn: parsed.SENTRY_DSN,
    sentryEnvironment: parsed.SENTRY_ENVIRONMENT ?? parsed.APP_ENV,
    vehicleCatalog:
      parsed.FLEET_VEHICLE_CATALOG_URL === undefined
        ? null
        : {
            cacheHours: parsed.FLEET_VEHICLE_CATALOG_CACHE_HOURS,
            url: parsed.FLEET_VEHICLE_CATALOG_URL,
          },
  }
}

function isTrustedLookupUrl(value: string): boolean {
  return (
    /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[^\s]*)?$/.test(value) ||
    /^http:\/\/localhost(?::\d{1,5})?(?:\/[^\s]*)?$/.test(value)
  )
}

function isTrustedFrontendOrigin(value: string): boolean {
  return (
    /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/.test(value) ||
    /^http:\/\/localhost(?::\d{1,5})?$/.test(value)
  )
}

export function isTrustedIdentityUrl(value: string): boolean {
  return (
    /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]*)*$/.test(value) ||
    /^http:\/\/localhost(?::\d{1,5})?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]*)*$/.test(value)
  )
}
