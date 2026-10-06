/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  CANCEL_WAIT_SECONDS,
  findStuckJobs,
  MAX_RUN_ATTEMPTS,
  runWatchdog,
  shouldRerun,
  STUCK_QUEUE_THRESHOLD_MINUTES,
  type WorkflowClient,
  type WorkflowJob,
  type WorkflowRun,
} from '../.github/scripts/deploy-watchdog'

const NOW = new Date('2026-10-02T19:30:00Z')
const TIP = 'tip00000'

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString()
}

function job(overrides: Partial<WorkflowJob> = {}): WorkflowJob {
  return {
    createdAt: minutesAgo(60),
    name: 'deploy-client',
    runnerName: null,
    status: 'queued',
    ...overrides,
  }
}

function finishedJob(name: string): WorkflowJob {
  return job({ name, runnerName: 'GitHub Actions 1', status: 'completed' })
}

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    event: 'push',
    headBranch: 'main',
    headSha: TIP,
    id: 1,
    jobs: [finishedJob('deploy-api'), job()],
    runAttempt: 1,
    status: 'queued',
    ...overrides,
  }
}

describe('o run preso que tranca a branch (incidente de 02/10)', () => {
  it('main: um job sem runner há horas, o resto concluído, é preso', () => {
    const stuck = findStuckJobs({ now: NOW, run: run() })

    expect(stuck.map((candidate) => candidate.name)).toEqual(['deploy-client'])
  })

  it('staging: o mesmo defeito em outro job (deploy-driver) também é preso', () => {
    const stuck = findStuckJobs({
      now: NOW,
      run: run({
        headBranch: 'staging',
        jobs: [
          finishedJob('deploy-api'),
          finishedJob('deploy-frontend'),
          job({ createdAt: minutesAgo(36), name: 'deploy-driver' }),
        ],
      }),
    })

    expect(stuck.map((candidate) => candidate.name)).toEqual(['deploy-driver'])
  })
})

describe('o que o watchdog nunca pode confundir com um run preso', () => {
  it('fila normal: o job na fila há poucos minutos não é preso', () => {
    const stuck = findStuckJobs({
      now: NOW,
      run: run({ jobs: [job({ createdAt: minutesAgo(STUCK_QUEUE_THRESHOLD_MINUTES - 1) })] }),
    })

    expect(stuck).toHaveLength(0)
  })

  it('o limite é estrito: logo acima dele já é preso', () => {
    const stuck = findStuckJobs({
      now: NOW,
      run: run({ jobs: [job({ createdAt: minutesAgo(STUCK_QUEUE_THRESHOLD_MINUTES + 1) })] }),
    })

    expect(stuck).toHaveLength(1)
  })

  it('NUNCA cancela com job em andamento: interromper o deploy no meio deixa serviços em versões diferentes', () => {
    const stuck = findStuckJobs({
      now: NOW,
      run: run({
        jobs: [
          job({ name: 'deploy-api', runnerName: 'GitHub Actions 2', status: 'in_progress' }),
          job(),
        ],
        status: 'in_progress',
      }),
    })

    expect(stuck).toHaveLength(0)
  })

  it('job com runner atribuído não é preso, mesmo velho', () => {
    const stuck = findStuckJobs({
      now: NOW,
      run: run({ jobs: [job({ runnerName: 'GitHub Actions 7' })] }),
    })

    expect(stuck).toHaveLength(0)
  })

  it('job esperando aprovação do ambiente (`waiting`) não é fila: é a proteção funcionando', () => {
    const stuck = findStuckJobs({ now: NOW, run: run({ jobs: [job({ status: 'waiting' })] }) })

    expect(stuck).toHaveLength(0)
  })

  it('run de pull request fica de fora: lá o push novo já cancela o anterior', () => {
    const stuck = findStuckJobs({ now: NOW, run: run({ event: 'pull_request' }) })

    expect(stuck).toHaveLength(0)
  })

  it('branch que não é main nem staging fica de fora', () => {
    const stuck = findStuckJobs({ now: NOW, run: run({ headBranch: 'work/spec-1' }) })

    expect(stuck).toHaveLength(0)
  })

  it('run `pending` (atrás de outro na concorrência, sem job) não é preso: é a vítima', () => {
    const stuck = findStuckJobs({ now: NOW, run: run({ jobs: [], status: 'pending' }) })

    expect(stuck).toHaveLength(0)
  })

  it('run já concluído não é preso', () => {
    const stuck = findStuckJobs({ now: NOW, run: run({ status: 'completed' }) })

    expect(stuck).toHaveLength(0)
  })
})

describe('refazer o deploy só quando é seguro', () => {
  const stuckRun = run()

  it('é o commit mais novo da branch e não há outro run aberto: refaz', () => {
    expect(shouldRerun({ branchTip: TIP, openRuns: [stuckRun], run: stuckRun })).toBe(true)
  })

  it('há um run mais novo esperando atrás: NÃO refaz, ele já publica o código mais recente', () => {
    const waiting = run({ headSha: 'newer000', id: 2, jobs: [], status: 'pending' })

    expect(
      shouldRerun({ branchTip: 'newer000', openRuns: [stuckRun, waiting], run: stuckRun }),
    ).toBe(false)
  })

  it('outro run aberto no MESMO commit (ex.: disparo manual) já vai publicar: NÃO refaz, duplicaria', () => {
    const manual = run({ event: 'workflow_dispatch', id: 3, jobs: [], status: 'pending' })

    expect(shouldRerun({ branchTip: TIP, openRuns: [stuckRun, manual], run: stuckRun })).toBe(false)
  })

  it('o commit do run já não é a ponta da branch: NÃO refaz, publicaria código velho', () => {
    expect(shouldRerun({ branchTip: 'newer000', openRuns: [stuckRun], run: stuckRun })).toBe(false)
  })

  it('run aberto em OUTRA branch não impede refazer', () => {
    const elsewhere = run({ headBranch: 'staging', id: 9 })

    expect(shouldRerun({ branchTip: TIP, openRuns: [stuckRun, elsewhere], run: stuckRun })).toBe(
      true,
    )
  })

  it('teto de tentativas: o defeito sendo outro, não vira laço de refazer e cancelar', () => {
    const exhausted = run({ runAttempt: MAX_RUN_ATTEMPTS })

    expect(shouldRerun({ branchTip: TIP, openRuns: [exhausted], run: exhausted })).toBe(false)
  })
})

type Call = Readonly<{ kind: string; runId: number }>

function createFakeClient(input: {
  readonly branchTip?: string
  /** Quantas leituras de status devolvem "ainda aberto" depois de cada pedido de cancelamento. */
  readonly openReadsAfterCancel?: number
  readonly openRuns: readonly WorkflowRun[]
  readonly stayOpenAfterForce?: boolean
}): { readonly calls: Call[]; readonly client: WorkflowClient } {
  const calls: Call[] = []
  let pendingOpenReads = 0
  let hasForced = false
  const record = (kind: string, runId: number): void => void calls.push({ kind, runId })

  const client: WorkflowClient = {
    cancelRun: (runId) => {
      record('cancel', runId)
      pendingOpenReads = input.openReadsAfterCancel ?? 0
      return Promise.resolve()
    },
    forceCancelRun: (runId) => {
      record('force-cancel', runId)
      hasForced = true
      pendingOpenReads = input.stayOpenAfterForce === true ? Number.MAX_SAFE_INTEGER : 0
      return Promise.resolve()
    },
    getBranchTip: () => Promise.resolve(input.branchTip ?? TIP),
    getRunStatus: () => {
      if (pendingOpenReads > 0) {
        pendingOpenReads -= 1
        return Promise.resolve('in_progress')
      }
      return Promise.resolve(hasForced || calls.length > 0 ? 'completed' : 'queued')
    },
    listOpenRuns: () => Promise.resolve(input.openRuns),
    rerunRun: (runId) => {
      record('rerun', runId)
      return Promise.resolve()
    },
  }
  return { calls, client }
}

const instantSleep = (): Promise<void> => Promise.resolve()
const POLLS_UNTIL_FORCE = Math.ceil(CANCEL_WAIT_SECONDS / 15) + 2

describe('o watchdog de ponta a ponta', () => {
  it('não faz NADA quando nada está preso', async () => {
    const { calls, client } = createFakeClient({
      openRuns: [run({ jobs: [job({ createdAt: minutesAgo(2) })] })],
    })

    const results = await runWatchdog({ client, now: NOW, sleep: instantSleep })

    expect(results).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  it('cancela o run preso e refaz quando ele era a ponta da branch', async () => {
    const { calls, client } = createFakeClient({ openRuns: [run()] })

    const results = await runWatchdog({ client, now: NOW, sleep: instantSleep })

    expect(calls.map((call) => call.kind)).toEqual(['cancel', 'rerun'])
    expect(results[0]?.status).toBe('fulfilled')
  })

  it('cancela o run preso e NÃO refaz quando há um mais novo esperando atrás', async () => {
    const waiting = run({ headSha: 'newer000', id: 2, jobs: [], status: 'pending' })
    const { calls, client } = createFakeClient({
      branchTip: 'newer000',
      openRuns: [run(), waiting],
    })

    await runWatchdog({ client, now: NOW, sleep: instantSleep })

    expect(calls.map((call) => call.kind)).toEqual(['cancel'])
  })

  it('o cancelamento que demora é esperado, sem force-cancel', async () => {
    const { calls, client } = createFakeClient({ openReadsAfterCancel: 3, openRuns: [run()] })

    await runWatchdog({ client, now: NOW, sleep: instantSleep })

    expect(calls.map((call) => call.kind)).toEqual(['cancel', 'rerun'])
  })

  it('o cancelamento que não pega escala para force-cancel', async () => {
    const { calls, client } = createFakeClient({
      openReadsAfterCancel: POLLS_UNTIL_FORCE,
      openRuns: [run()],
    })

    await runWatchdog({ client, now: NOW, sleep: instantSleep })

    expect(calls.map((call) => call.kind)).toEqual(['cancel', 'force-cancel', 'rerun'])
  })

  it('run que não termina nem com force-cancel vira falha visível e NÃO é refeito', async () => {
    const { calls, client } = createFakeClient({
      openReadsAfterCancel: POLLS_UNTIL_FORCE,
      openRuns: [run()],
      stayOpenAfterForce: true,
    })

    const results = await runWatchdog({ client, now: NOW, sleep: instantSleep })

    expect(results[0]?.status).toBe('rejected')
    expect(calls.map((call) => call.kind)).toEqual(['cancel', 'force-cancel'])
  })

  it('um run que falha não impede o conserto do outro', async () => {
    const failing = run({ id: 1 })
    const healthy = run({ headBranch: 'staging', id: 2 })
    const { calls, client } = createFakeClient({ openRuns: [failing, healthy] })
    const flaky: WorkflowClient = {
      ...client,
      cancelRun: (runId) =>
        runId === 1 ? Promise.reject(new Error('boom')) : client.cancelRun(runId),
    }

    const results = await runWatchdog({ client: flaky, now: NOW, sleep: instantSleep })

    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled'])
    expect(calls.filter((call) => call.runId === 2).map((call) => call.kind)).toContain('cancel')
  })
})
