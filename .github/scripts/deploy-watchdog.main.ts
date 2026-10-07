/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  runWatchdog,
  type WatchdogOutcome,
  type WorkflowClient,
  type WorkflowJob,
  type WorkflowRun,
} from './deploy-watchdog'

const API_ROOT = 'https://api.github.com'
const DEPLOY_WORKFLOW_FILE = 'deploy.yml'
/** `pending` entra: run atrás de outro na fila de concorrência ainda não tem job, e conta como aberto. */
const OPEN_RUN_STATUSES = ['queued', 'in_progress', 'pending'] as const
const MILLISECONDS_PER_SECOND = 1000

type GitHubJobPayload = Readonly<{
  created_at: string
  name: string
  runner_name: string | null
  status: string
}>

type GitHubRunPayload = Readonly<{
  event: string
  head_branch: string
  head_sha: string
  id: number
  run_attempt: number
  status: string
}>

function readRequiredEnvironment(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`Variável ${name} ausente`)
  return value
}

function createGitHubClient(input: {
  readonly repository: string
  readonly token: string
}): WorkflowClient {
  const repositoryRoot = `${API_ROOT}/repos/${input.repository}`

  async function call(request: {
    readonly method: 'GET' | 'POST'
    readonly path: string
  }): Promise<unknown> {
    const response = await fetch(`${repositoryRoot}${request.path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${input.token}`,
        'x-github-api-version': '2022-11-28',
      },
      method: request.method,
    })
    if (!response.ok) {
      throw new Error(`${request.method} ${request.path} respondeu ${response.status}`)
    }
    const body = await response.text()
    return body === '' ? {} : (JSON.parse(body) as unknown)
  }

  async function listJobs(runId: number): Promise<readonly WorkflowJob[]> {
    const payload = (await call({
      method: 'GET',
      path: `/actions/runs/${runId}/jobs?per_page=100`,
    })) as { readonly jobs: readonly GitHubJobPayload[] }
    return payload.jobs.map((job) => ({
      createdAt: job.created_at,
      name: job.name,
      runnerName: job.runner_name,
      status: job.status,
    }))
  }

  async function listRunsWithStatus(status: string): Promise<readonly GitHubRunPayload[]> {
    const payload = (await call({
      method: 'GET',
      path: `/actions/workflows/${DEPLOY_WORKFLOW_FILE}/runs?status=${status}&per_page=50`,
    })) as { readonly workflow_runs: readonly GitHubRunPayload[] }
    return payload.workflow_runs
  }

  return {
    cancelRun: async (runId) =>
      void (await call({ method: 'POST', path: `/actions/runs/${runId}/cancel` })),
    forceCancelRun: async (runId) =>
      void (await call({ method: 'POST', path: `/actions/runs/${runId}/force-cancel` })),
    getBranchTip: async (branch) => {
      const payload = (await call({ method: 'GET', path: `/branches/${branch}` })) as {
        readonly commit: { readonly sha: string }
      }
      return payload.commit.sha
    },
    getRunStatus: async (runId) => {
      const payload = (await call({ method: 'GET', path: `/actions/runs/${runId}` })) as {
        readonly status: string
      }
      return payload.status
    },
    listOpenRuns: async (): Promise<readonly WorkflowRun[]> => {
      const perStatus = await Promise.all(OPEN_RUN_STATUSES.map(listRunsWithStatus))
      const runs = perStatus.flat()
      return Promise.all(
        runs.map(async (run) => ({
          event: run.event,
          headBranch: run.head_branch,
          headSha: run.head_sha,
          id: run.id,
          /** Run `pending` ainda não tem job: pedir os jobs dele só devolveria lista vazia. */
          jobs: run.status === 'pending' ? [] : await listJobs(run.id),
          runAttempt: run.run_attempt,
          status: run.status,
        })),
      )
    },
    rerunRun: async (runId) =>
      void (await call({ method: 'POST', path: `/actions/runs/${runId}/rerun` })),
  }
}

function reportOutcome(outcome: WatchdogOutcome): void {
  const action = outcome.rerun ? 'cancelado e refeito' : 'cancelado'
  const forced = outcome.forced ? ' (foi preciso force-cancel)' : ''
  process.stdout.write(
    `::warning::Deploy run ${outcome.runId} preso em fila (${outcome.stuckJobs.join(', ')}): ${action}${forced}\n`,
  )
}

async function main(): Promise<void> {
  const client = createGitHubClient({
    repository: readRequiredEnvironment('GITHUB_REPOSITORY'),
    token: readRequiredEnvironment('GITHUB_TOKEN'),
  })
  const results = await runWatchdog({
    client,
    now: new Date(),
    sleep: (seconds) =>
      new Promise((resolve) => setTimeout(resolve, seconds * MILLISECONDS_PER_SECOND)),
  })

  const failures: string[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') reportOutcome(result.value)
    else failures.push(String(result.reason))
  }
  process.stdout.write(`Deploy watchdog: ${results.length} run(s) preso(s) tratado(s)\n`)

  if (failures.length > 0) {
    process.stderr.write(`::error::${failures.join(' | ')}\n`)
    process.exitCode = 1
  }
}

await main()
