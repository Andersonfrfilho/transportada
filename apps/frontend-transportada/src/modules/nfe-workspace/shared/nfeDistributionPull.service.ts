/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  NfeDistributionEnvironment,
  NfeDistributionStatus,
} from './nfeWorkspaceClient.service'

export type NfeDistributionPullReason = 'cooldown' | 'in-progress' | 'unavailable'

export type NfeDistributionPullTone = 'busy' | 'cooldown' | 'ready' | 'unavailable'

export type NfeDistributionPullControl = Readonly<{
  canTrigger: boolean
  environment: NfeDistributionEnvironment | null
  lastPulledAt: null | string
  nextAllowedAt?: null | string
  reason?: NfeDistributionPullReason
  retryAfterSeconds?: number
  tone: NfeDistributionPullTone
}>

type PullControlInput = Readonly<{
  now: Date
  status: NfeDistributionStatus | undefined
}>

const SECONDS_PER_MINUTE = 60

export function formatCountdown(totalSeconds: number): string {
  const safeSeconds =
    Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0
  const minutes = Math.floor(safeSeconds / SECONDS_PER_MINUTE)
  const seconds = safeSeconds % SECONDS_PER_MINUTE
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function cooldownRemainingSeconds(input: {
  readonly nextAllowedAt: string | null
  readonly now: Date
}): number | null {
  if (input.nextAllowedAt === null) return null
  const nextAllowed = Date.parse(input.nextAllowedAt)
  if (Number.isNaN(nextAllowed)) return null
  const remainingMs = nextAllowed - input.now.getTime()
  return remainingMs > 0 ? Math.ceil(remainingMs / 1_000) : null
}

export function createNfeDistributionPullControl(
  input: PullControlInput,
): NfeDistributionPullControl {
  const { status } = input
  if (status === undefined) {
    return {
      canTrigger: false,
      environment: null,
      lastPulledAt: null,
      reason: 'unavailable',
      tone: 'unavailable',
    }
  }

  const base = { environment: status.environment, lastPulledAt: status.lastPulledAt } as const

  if (status.pullInProgress) {
    return { ...base, canTrigger: false, reason: 'in-progress', tone: 'busy' }
  }

  const retryAfterSeconds = cooldownRemainingSeconds({
    nextAllowedAt: status.nextAllowedAt,
    now: input.now,
  })
  if (retryAfterSeconds !== null) {
    return {
      ...base,
      canTrigger: false,
      nextAllowedAt: status.nextAllowedAt,
      reason: 'cooldown',
      retryAfterSeconds,
      tone: 'cooldown',
    }
  }

  if (!status.canPull) {
    return { ...base, canTrigger: false, reason: 'unavailable', tone: 'unavailable' }
  }

  return { ...base, canTrigger: true, tone: 'ready' }
}
