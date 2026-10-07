/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * ⚠️ O deploy fica trancado quando um job nasce `queued` e nenhum runner o pega — lado do GitHub, e
 * aconteceu duas vezes em 02/10/2026 (`deploy-client` na main, `deploy-driver` na staging). Nada no
 * workflow se defende disso: `timeout-minutes` só conta depois que o job começa, e a concorrência
 * por branch (`cancel-in-progress: false`, de propósito — interromper um deploy no meio deixa os
 * serviços em versões diferentes) faz um run preso segurar todos os seguintes, que ficam `pending`
 * sem criar um job sequer. Resultado: o merge entrou e o deploy não rodou, sem nenhum erro.
 *
 * Este módulo decide, sem tocar na rede, quais runs estão presos e o que fazer com cada um.
 */

export const STUCK_QUEUE_THRESHOLD_MINUTES = 20
export const MAX_RUN_ATTEMPTS = 3
export const CANCEL_WAIT_SECONDS = 120
export const FORCE_CANCEL_WAIT_SECONDS = 60
export const POLL_INTERVAL_SECONDS = 15

const WATCHED_BRANCHES = ['main', 'staging'] as const
const MILLISECONDS_PER_MINUTE = 60_000

export type WorkflowJob = Readonly<{
  createdAt: string
  name: string
  runnerName: string | null
  status: string
}>

export type WorkflowRun = Readonly<{
  event: string
  headBranch: string
  headSha: string
  id: number
  jobs: readonly WorkflowJob[]
  runAttempt: number
  status: string
}>

export type WorkflowClient = Readonly<{
  cancelRun: (runId: number) => Promise<void>
  forceCancelRun: (runId: number) => Promise<void>
  getBranchTip: (branch: string) => Promise<string>
  getRunStatus: (runId: number) => Promise<string>
  listOpenRuns: () => Promise<readonly WorkflowRun[]>
  rerunRun: (runId: number) => Promise<void>
}>

export type WatchdogOutcome = Readonly<{
  forced: boolean
  rerun: boolean
  runId: number
  stuckJobs: readonly string[]
}>

function isWatchedRun(run: WorkflowRun): boolean {
  if (run.event === 'pull_request') return false
  return (WATCHED_BRANCHES as readonly string[]).includes(run.headBranch)
}

function isUnassignedQueuedJob(job: WorkflowJob): boolean {
  return job.status === 'queued' && job.runnerName === null
}

function minutesSince(input: { readonly isoTimestamp: string; readonly now: Date }): number {
  return (input.now.getTime() - Date.parse(input.isoTimestamp)) / MILLISECONDS_PER_MINUTE
}

/**
 * Só é preso o run que não tem NADA em andamento: com um job `in_progress` ainda há deploy a
 * meio caminho, e cancelar agora é o dano que a concorrência existe para evitar. Quando esse job
 * terminar, a próxima rodada do watchdog já enxerga o run sem nada em voo.
 */
export function findStuckJobs(input: {
  readonly now: Date
  readonly run: WorkflowRun
  readonly thresholdMinutes?: number
}): readonly WorkflowJob[] {
  const { now, run, thresholdMinutes = STUCK_QUEUE_THRESHOLD_MINUTES } = input
  if (!isWatchedRun(run)) return []
  if (run.status !== 'queued' && run.status !== 'in_progress') return []
  if (run.jobs.some((job) => job.status === 'in_progress')) return []

  return run.jobs.filter(
    (job) =>
      isUnassignedQueuedJob(job) &&
      minutesSince({ isoTimestamp: job.createdAt, now }) > thresholdMinutes,
  )
}

/**
 * Refazer só quando o run preso era o commit mais novo da branch e não há outro run aberto nela:
 * se há um mais novo esperando atrás, cancelar o preso já libera o grupo e o novo publica o código
 * mais recente — refazer o velho publicaria código velho por cima. O teto de tentativas impede um
 * laço de refazer-cancelar quando o defeito for outro.
 */
export function shouldRerun(input: {
  readonly branchTip: string
  readonly openRuns: readonly WorkflowRun[]
  readonly run: WorkflowRun
}): boolean {
  const { branchTip, openRuns, run } = input
  if (run.headSha !== branchTip) return false
  if (run.runAttempt >= MAX_RUN_ATTEMPTS) return false
  return !openRuns.some((other) => other.id !== run.id && other.headBranch === run.headBranch)
}

async function waitUntilCompleted(input: {
  readonly client: WorkflowClient
  readonly runId: number
  readonly sleep: (seconds: number) => Promise<void>
  readonly timeoutSeconds: number
}): Promise<boolean> {
  const { client, runId, sleep, timeoutSeconds } = input
  /** Sondagem em série: cada leitura só faz sentido depois da pausa que a antecede. */
  for (let waited = 0; waited <= timeoutSeconds; waited += POLL_INTERVAL_SECONDS) {
    if ((await client.getRunStatus(runId)) === 'completed') return true
    await sleep(POLL_INTERVAL_SECONDS)
  }
  return false
}

async function releaseStuckRun(input: {
  readonly client: WorkflowClient
  readonly openRuns: readonly WorkflowRun[]
  readonly run: WorkflowRun
  readonly sleep: (seconds: number) => Promise<void>
  readonly stuckJobs: readonly WorkflowJob[]
}): Promise<WatchdogOutcome> {
  const { client, openRuns, run, sleep, stuckJobs } = input
  const runId = run.id
  await client.cancelRun(runId)

  let forced = false
  let isCompleted = await waitUntilCompleted({
    client,
    runId,
    sleep,
    timeoutSeconds: CANCEL_WAIT_SECONDS,
  })
  if (!isCompleted) {
    forced = true
    await client.forceCancelRun(runId)
    isCompleted = await waitUntilCompleted({
      client,
      runId,
      sleep,
      timeoutSeconds: FORCE_CANCEL_WAIT_SECONDS,
    })
  }
  if (!isCompleted) throw new Error(`O run ${runId} não terminou nem com force-cancel`)

  const branchTip = await client.getBranchTip(run.headBranch)
  const rerun = shouldRerun({ branchTip, openRuns, run })
  if (rerun) await client.rerunRun(runId)

  return { forced, rerun, runId, stuckJobs: stuckJobs.map((job) => job.name) }
}

export async function runWatchdog(input: {
  readonly client: WorkflowClient
  readonly now: Date
  readonly sleep: (seconds: number) => Promise<void>
}): Promise<readonly PromiseSettledResult<WatchdogOutcome>[]> {
  const { client, now, sleep } = input
  const openRuns = await client.listOpenRuns()
  const stuck = openRuns
    .map((run) => ({ run, stuckJobs: findStuckJobs({ now, run }) }))
    .filter((candidate) => candidate.stuckJobs.length > 0)

  /** `allSettled`: um run que não cancela não pode impedir o conserto do outro. */
  return Promise.allSettled(
    stuck.map((candidate) => releaseStuckRun({ client, openRuns, sleep, ...candidate })),
  )
}
