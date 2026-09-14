/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DocumentOutputClassification } from '../../cte-profiles/domain/document-output.policy.js'
import {
  ISSUANCE_BLOCK_REASON_LABELS,
  ISSUANCE_NO_PROFILE_LABELS,
  ISSUANCE_UNKNOWN_REASON_LABEL,
} from './whatsapp-issuance-labels.constant.js'
import { ISSUANCE_BLOCKED_NUMBERS_PER_REASON } from './whatsapp-issuance-flow.constant.js'

export type VolumetryReasonGroup = Readonly<{ numbers: readonly string[]; reason: string }>

export type IssuanceVolumetry = Readonly<{
  blocked: readonly VolumetryReasonGroup[]
  blockedCount: number
  cte: number
  nfse: number
  noProfile: readonly VolumetryReasonGroup[]
  noProfileCount: number
  total: number
}>

export type VolumetryEntry = Readonly<{
  classification: DocumentOutputClassification
  number: string
}>

export function summarizeIssuanceVolumetry(entries: readonly VolumetryEntry[]): IssuanceVolumetry {
  const blocked = new Map<string, string[]>()
  const noProfile = new Map<string, string[]>()
  let cte = 0
  let nfse = 0
  for (const { classification, number } of entries) {
    if (classification.output === 'cte') cte += 1
    if (classification.output === 'nfse') nfse += 1
    if (classification.output === 'blocked') append(blocked, classification.reason, number)
    if (classification.output === 'no_profile') append(noProfile, classification.reason, number)
  }
  return {
    blocked: toGroups(blocked),
    blockedCount: entries.length - cte - nfse - countOf(noProfile),
    cte,
    nfse,
    noProfile: toGroups(noProfile),
    noProfileCount: countOf(noProfile),
    total: entries.length,
  }
}

/** conversation-flow §5: uma ideia por mensagem — só os números, sem valor somado. */
export function formatVolumetryHeadline(volumetry: IssuanceVolumetry): string {
  const parts = [
    `${volumetry.total} ${volumetry.total === 1 ? 'nota' : 'notas'}`,
    `${volumetry.cte} CT-e`,
    `${volumetry.nfse} NFS-e`,
  ]
  if (volumetry.blockedCount > 0) {
    parts.push(
      `${volumetry.blockedCount} ${volumetry.blockedCount === 1 ? 'bloqueada' : 'bloqueadas'}`,
    )
  }
  if (volumetry.noProfileCount > 0) parts.push(`${volumetry.noProfileCount} sem perfil`)
  return parts.join(' · ')
}

/** A segunda mensagem só existe quando há o que explicar: bloqueados e sem perfil, por motivo. */
export function formatVolumetryDetails(volumetry: IssuanceVolumetry): string | undefined {
  const sections: string[] = []
  if (volumetry.blocked.length > 0) {
    sections.push(formatSection('Bloqueadas:', volumetry.blocked, labelBlockReason))
  }
  if (volumetry.noProfile.length > 0) {
    sections.push(formatSection('Sem perfil de emissão:', volumetry.noProfile, labelNoProfile))
  }
  return sections.length === 0 ? undefined : sections.join('\n')
}

function formatSection(
  title: string,
  groups: readonly VolumetryReasonGroup[],
  label: (reason: string) => string,
): string {
  const lines = groups.map((group) => `• ${label(group.reason)}: ${formatNumbers(group.numbers)}`)
  return [title, ...lines].join('\n')
}

function formatNumbers(numbers: readonly string[]): string {
  const shown = numbers.slice(0, ISSUANCE_BLOCKED_NUMBERS_PER_REASON).join(', ')
  const rest = numbers.length - ISSUANCE_BLOCKED_NUMBERS_PER_REASON
  return rest > 0 ? `${shown} e mais ${rest}` : shown
}

function labelBlockReason(reason: string): string {
  return ISSUANCE_BLOCK_REASON_LABELS[reason] ?? ISSUANCE_UNKNOWN_REASON_LABEL
}

function labelNoProfile(reason: string): string {
  return (
    ISSUANCE_NO_PROFILE_LABELS[reason as keyof typeof ISSUANCE_NO_PROFILE_LABELS] ??
    ISSUANCE_UNKNOWN_REASON_LABEL
  )
}

function append(groups: Map<string, string[]>, reason: string, number: string): void {
  const numbers = groups.get(reason) ?? []
  numbers.push(number)
  groups.set(reason, numbers)
}

function countOf(groups: ReadonlyMap<string, readonly string[]>): number {
  let total = 0
  for (const numbers of groups.values()) total += numbers.length
  return total
}

function toGroups(groups: ReadonlyMap<string, readonly string[]>): VolumetryReasonGroup[] {
  return [...groups.entries()].map(([reason, numbers]) => ({
    numbers: numbers.toSorted(compareDocumentNumbers),
    reason,
  }))
}

function compareDocumentNumbers(left: string, right: string): number {
  const byLength = left.length - right.length
  return byLength !== 0 ? byLength : left.localeCompare(right)
}
