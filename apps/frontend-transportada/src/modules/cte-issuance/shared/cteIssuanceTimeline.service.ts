/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteIssuanceSummary } from './cteIssuanceClient.service'

export type CteIssuanceTimelineItem = Readonly<{
  descriptionKey: string
  status: string
  titleKey: string
}>

export function createCteIssuanceTimeline(input: {
  readonly issuance: unknown
}): readonly CteIssuanceTimelineItem[] {
  const status = readStatus(input.issuance)
  return [
    {
      descriptionKey: `cteIssuance.timeline.${status}.description`,
      status,
      titleKey: `cteIssuance.timeline.${status}.title`,
    },
  ]
}

function readStatus(value: unknown): CteIssuanceSummary['status'] {
  if (typeof value !== 'object' || value === null || !('status' in value)) return 'requested'
  const status = (value as Readonly<{ status: unknown }>).status
  if (
    status === 'authorized' ||
    status === 'failed' ||
    status === 'rejected' ||
    status === 'requested' ||
    status === 'retry_scheduled'
  ) {
    return status
  }
  return 'requested'
}
