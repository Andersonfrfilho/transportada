/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * ⚠️ Cópia por valor do catálogo da API: o bundle não carrega código de lá, e
 * `test/shared/job-catalog.contract.ts` é o que garante que os dois não divergem.
 */

/** A batida do agendador. É o piso de granularidade de toda rotina — nada corre mais fino que ela. */
export const JOB_TICK_INTERVAL_SECONDS = 300

/**
 * Teto de intervalo, noventa dias. Não existe cadência legítima acima disso, e sem teto o campo de
 * período viraria um segundo jeito de desligar rotina — desligar tem controle próprio, que marca o
 * cartão com desde quando e por quem. Rotina parada por um "intervalo de um ano" não se anuncia.
 */
export const JOB_MAXIMUM_INTERVAL_SECONDS = 7_776_000

/**
 * O que o invólucro do ciclo escreve, igual para todas as rotinas: ele não conhece o assunto de
 * nenhuma delas, só sabe se terminou, se o operador pediu parada, se o lease venceu com o processo
 * morto, ou se subiu um erro que ninguém previu.
 *
 * `unexpected_error` é o pouso do imprevisto, e existe por um motivo estreito: sem ele, um erro fora
 * do vocabulário deixaria a linha **sem `finished_at`**, que é exatamente a morte calada que esta
 * spec veio consertar. Ele aparecer em produção é lacuna de vocabulário, e a resposta é dar nome ao
 * caso na rotina que o produziu.
 */
export const JOB_WRAPPER_OUTCOMES = [
  'succeeded',
  'cancelled',
  'abandoned',
  'unexpected_error',
] as const
export type JobWrapperOutcome = (typeof JOB_WRAPPER_OUTCOMES)[number]

/**
 * As rotinas agendadas da instalação, cada uma com o menor intervalo que aceita e o
 * vocabulário fechado de falha dela. O nome é a chave natural do relógio (`job_schedules`) e o
 * rótulo de toda execução — ele viaja no envelope, no CHECK do banco e na tela, então mudar um valor
 * daqui é migração, não renomeação.
 *
 * O `outcome` de falha é **código estável por rotina**, nunca texto solto: quem traduz é o painel, e
 * "falhou" sem dizer o quê obriga o operador a abrir um log que ele não tem acesso para ler. O
 * código não é validado por CHECK no banco de propósito: a coluna é uma só para todas as rotinas, e
 * um CHECK sobre a união dos vocabulários aceitaria `anp_unreachable` numa execução de
 * notificação — cobraria uma migration por palavra nova sem impedir o único erro que importa.
 */
export const JOB_CATALOG = [
  {
    /**
     * O vocabulário é o de `distribution-eligibility.policy.ts`, palavra por palavra: a rotina só
     * falha pelo que a elegibilidade recusa, e uma segunda lista divergiria na primeira razão nova.
     */
    failureOutcomes: [
      'company_disabled',
      'not_opted_in',
      'missing_synthetic_membership',
      'certificate_missing',
      'certificate_not_yet_valid',
      'certificate_expired',
      'cooldown_active',
    ],
    job: 'nfe.distribution.pull',
    /**
     * A batida, e não a janela de uma hora da SEFAZ: o ciclo fora da janela é no-op, recusado por
     * `cooldown_active` **antes** de qualquer chamada, então um intervalo fino não bate no serviço
     * dela — só reencontra a permissão mais perto do instante em que ela reabre.
     */
    minimumIntervalSeconds: JOB_TICK_INTERVAL_SECONDS,
  },
  {
    failureOutcomes: [
      'anp_unreachable',
      'anp_week_not_published',
      'anp_malformed_workbook',
      'aneel_unreachable',
      'aneel_empty_slice',
    ],
    job: 'fuel.price.pull',
    /**
     * Um dia. A ANP publica uma vez por semana e a ANEEL homologa por vigência, então nada abaixo
     * disso traz dado novo — e as duas são serviço público, de graça e sem contrato: bater de
     * minuto em minuto por um erro de digitação é o caminho para sermos bloqueados.
     */
    minimumIntervalSeconds: 86_400,
  },
  {
    failureOutcomes: [
      'provider_unreachable',
      'malformed_response',
      'credential_missing',
      'document_unavailable',
    ],
    job: 'nfse.status.pull',
    /** Provedor contratado, com timeout próprio: aqui a nota autorizada precisa liquidar rápido. */
    minimumIntervalSeconds: JOB_TICK_INTERVAL_SECONDS,
  },
  {
    failureOutcomes: ['queue_unreachable', 'template_missing'],
    job: 'notification.schedules.run',
    /** Não sai da instalação — só lê agendamento vencido e publica na nossa própria fila. */
    minimumIntervalSeconds: JOB_TICK_INTERVAL_SECONDS,
  },
  {
    /**
     * Spec 057 / ADR-0045 §3: a coordenada tem prazo, e o prazo só existe porque uma rotina o
     * cumpre. Retenção escrita e não implementada é retenção que não existe.
     *
     * A rotina não fala com ninguém de fora e não depende de nada além do próprio banco — daí o
     * vocabulário de falha vazio: o que pode dar errado aqui é o imprevisto, e o invólucro já tem
     * nome para ele.
     */
    failureOutcomes: [],
    job: 'trip.location.purge',
    /**
     * Um dia. O corte é de noventa, então correr de hora em hora só encurtaria a retenção real em
     * minutos — e a varredura toca a tabela que a execução de campo escreve o dia inteiro.
     */
    minimumIntervalSeconds: 86_400,
  },
  {
    /**
     * O documento é o degrau que casa a pessoa dos dois lados na reconciliação, e ele só passou a
     * ser escrito agora: quem foi convidado antes disso está no realm sem `tax_id`, e nenhum
     * convite futuro alcança essa gente. A rotina é a passada que os alcança.
     *
     * Ela converge e termina: quando todo mundo tiver o atributo, cada ciclo não encontra nada e
     * fecha em zero. Desligar depois é decisão de operação, não condição para estar correta.
     */
    failureOutcomes: ['identity_provider_unreachable'],
    job: 'identity.document.backfill',
    /**
     * Um dia. O atraso não custa nada — o convite e a edição já mantêm o atributo em dia sozinhos,
     * e o que sobra aqui é gente que ninguém toca há meses.
     */
    minimumIntervalSeconds: 86_400,
  },
] as const

export type JobCatalogEntry = (typeof JOB_CATALOG)[number]
export type ScheduledJob = JobCatalogEntry['job']
export type JobFailureOutcome = JobCatalogEntry['failureOutcomes'][number]
export type JobOutcome = JobWrapperOutcome | JobFailureOutcome

export const SCHEDULED_JOBS: readonly ScheduledJob[] = JOB_CATALOG.map((entry) => entry.job)

/** Origem da execução: o ciclo que venceu, ou o operador que apertou o botão antes da hora. */
export const JOB_EXECUTION_ORIGINS = ['schedule', 'manual'] as const
export type JobExecutionOrigin = (typeof JOB_EXECUTION_ORIGINS)[number]

function indexByJob<TValue>(
  select: (entry: JobCatalogEntry) => TValue,
): Record<ScheduledJob, TValue> {
  const indexed = {} as Record<ScheduledJob, TValue>
  for (const entry of JOB_CATALOG) indexed[entry.job] = select(entry)
  return indexed
}

export const JOB_MINIMUM_INTERVAL_SECONDS: Record<ScheduledJob, number> = indexByJob(
  (entry) => entry.minimumIntervalSeconds,
)

export const JOB_FAILURE_OUTCOMES: Record<ScheduledJob, readonly JobFailureOutcome[]> = indexByJob(
  (entry) => entry.failureOutcomes,
)

export const JOB_OUTCOMES: Record<ScheduledJob, readonly JobOutcome[]> = indexByJob((entry) => [
  ...JOB_WRAPPER_OUTCOMES,
  ...entry.failureOutcomes,
])

export function isScheduledJob(value: unknown): value is ScheduledJob {
  return typeof value === 'string' && value in JOB_MINIMUM_INTERVAL_SECONDS
}

type IsJobOutcomeParams = {
  readonly job: ScheduledJob
  readonly outcome: string
}

/** O código é da rotina: `malformed_response` numa coleta de preço não diria nada ao operador. */
export function isJobOutcome({ job, outcome }: IsJobOutcomeParams): boolean {
  return JOB_OUTCOMES[job].includes(outcome as JobOutcome)
}
