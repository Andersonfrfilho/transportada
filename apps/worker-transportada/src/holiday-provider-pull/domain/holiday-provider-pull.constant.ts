/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const HOLIDAY_PROVIDER_PULL_JOB = 'holiday.provider.pull'

export const FERIADOS_API_BASE_URL = 'https://feriadosapi.com'

/**
 * Padrão de `FERIADOS_API_MONTHLY_REQUEST_BUDGET`: o limite do plano Developer (5.000 consultas por mês)
 * menos 10% de folga. O plano e o valor são a Q3 da spec 252, ainda em aberto: o usuário configura.
 */
export const FERIADOS_API_DEFAULT_MONTHLY_REQUEST_BUDGET = 4500

/** O máximo que a documentação aceita em `limit`. */
export const FERIADOS_API_PAGE_SIZE = 100

export const FERIADOS_API_REQUEST_TIMEOUT_MILLISECONDS = 15_000

/** Descoberta (ADR-0100 §5): até 2.000 notas por lote e 20 lotes por empresa em cada ciclo. */
export const HOLIDAY_DISCOVERY_BATCH_SIZE = 2000
export const HOLIDAY_DISCOVERY_MAX_BATCHES = 20

/** Busca (ADR-0100 §5, D9): 1,2 s entre requisições (~50/min, abaixo dos 60/min do fornecedor). */
export const FERIADOS_API_REQUEST_SPACING_MILLISECONDS = 1200

/** Teto de requisições por ciclo, contando páginas e o estadual de reforço. */
export const HOLIDAY_PROVIDER_CYCLE_REQUEST_CEILING = 100

/** Segurança contra a API que ignora `page` e devolve sempre uma página cheia. */
export const HOLIDAY_PROVIDER_MAX_PAGES = 10

/** D8: o par `(cidade, ano)` já buscado é rebuscado depois de 180 dias; o fora de cobertura, de 90. */
export const HOLIDAY_PROVIDER_REFETCH_DAYS = 180
export const HOLIDAY_PROVIDER_NOT_COVERED_RETRY_DAYS = 90

/** 1 h, 6 h, 24 h e, dali em diante, 7 dias (o teto do recuo). */
export const HOLIDAY_PROVIDER_FAILURE_BACKOFF_HOURS = [1, 6, 24, 168] as const

/** Sem `Retry-After` no 429, espera uma hora. */
export const HOLIDAY_PROVIDER_DEFAULT_RETRY_AFTER_SECONDS = 3600

/** O produto fixa o fuso em São Paulo (ADR-0096 Q3); sem horário de verão desde 2019. */
export const HOLIDAY_PROVIDER_TIME_ZONE = 'America/Sao_Paulo'
export const HOLIDAY_PROVIDER_UTC_OFFSET = '-03:00'

/** A resposta de uma página de 100 datas cabe com folga em 512 KB; acima disso o corpo não é lido. */
export const FERIADOS_API_MAX_BODY_BYTES = 524_288

/** O `Retry-After` do fornecedor fica entre um minuto e um dia, qualquer que seja o valor mandado. */
export const FERIADOS_API_MIN_RETRY_AFTER_SECONDS = 60
export const FERIADOS_API_MAX_RETRY_AFTER_SECONDS = 86_400

/** 402/403 numa cidade: o plano não a cobre, e o par só é tentado de novo depois de 30 dias. */
export const HOLIDAY_PROVIDER_PLAN_RESTRICTED_RETRY_DAYS = 30

/** Disjuntor: três `provider_unreachable` seguidos encerram o ciclo, e o resto fica para o próximo. */
export const HOLIDAY_PROVIDER_MAX_CONSECUTIVE_UNREACHABLE = 3

/** Teto do orçamento mensal configurável: acima disso é engano de configuração. */
export const FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET = 1_000_000
