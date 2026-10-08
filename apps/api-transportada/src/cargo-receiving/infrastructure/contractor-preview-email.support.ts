/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b: o que a leitura e a gravação da entrada por e-mail dividem — a forma pública do perfil (nunca o
 * hash), a trilha de auditoria (nunca o token nem o hash) e a conta de quais listas faltam.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, max } from 'drizzle-orm'

import { contractorReceivingProfiles } from '../../database/contractor-receiving-profile.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import {
  PREVIEW_ALLOWLIST_FIELD,
  PREVIEW_EMAIL_AUDIT,
  type PreviewAllowlistField,
} from '../domain/contractor-preview-email.constant.js'
import type {
  FindPreviewEmailParams,
  PreviewEmailActor,
  PreviewEmailSettings,
} from '../application/contractor-preview-email.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
export type PreviewEmailTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Executor = Database | PreviewEmailTransaction

export type PreviewEmailProfileRow = {
  readonly forwarderAllowlist: readonly string[] | null
  readonly hasInboundToken: boolean
  readonly id: string
  readonly senderAllowlist: readonly string[] | null
}

export const PREVIEW_EMAIL_PROFILE_COLUMNS = {
  forwarderAllowlist: contractorReceivingProfiles.previewForwarderAllowlist,
  hash: contractorReceivingProfiles.previewInboundTokenHash,
  id: contractorReceivingProfiles.id,
  senderAllowlist: contractorReceivingProfiles.previewSenderAllowlist,
} as const

export function toProfileRow(row: {
  readonly forwarderAllowlist: readonly string[] | null
  readonly hash: string | null
  readonly id: string
  readonly senderAllowlist: readonly string[] | null
}): PreviewEmailProfileRow {
  return {
    forwarderAllowlist: row.forwarderAllowlist,
    hasInboundToken: row.hash !== null,
    id: row.id,
    senderAllowlist: row.senderAllowlist,
  }
}

export function missingAllowlistFields(lists: {
  readonly forwarderAllowlist: readonly string[] | null
  readonly senderAllowlist: readonly string[] | null
}): readonly PreviewAllowlistField[] {
  const missing: PreviewAllowlistField[] = []
  if ((lists.forwarderAllowlist ?? []).length === 0) missing.push(PREVIEW_ALLOWLIST_FIELD.forwarder)
  if ((lists.senderAllowlist ?? []).length === 0) missing.push(PREVIEW_ALLOWLIST_FIELD.sender)
  return missing
}

export function isSameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index])
}

/** A hora do endereço ativo vem da última geração auditada; hash gravado por fora da trilha fica sem hora. */
export async function readPreviewEmailSettings(input: {
  readonly executor: Executor
  readonly params: FindPreviewEmailParams
  readonly profile: PreviewEmailProfileRow | undefined
}): Promise<PreviewEmailSettings> {
  const { params, profile } = input
  const inboundTokenSetAt = profile?.hasInboundToken === true ? await readSetAt(input) : null
  return {
    contractorId: params.contractorId,
    forwarderAllowlist: profile?.forwarderAllowlist ?? [],
    hasInboundToken: profile?.hasInboundToken ?? false,
    inboundTokenSetAt: inboundTokenSetAt?.toISOString() ?? null,
    senderAllowlist: profile?.senderAllowlist ?? [],
  }
}

async function readSetAt(input: {
  readonly executor: Executor
  readonly params: FindPreviewEmailParams
}): Promise<Date | null> {
  const [row] = await input.executor
    .select({ setAt: max(auditLogs.createdAt) })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.companyId, input.params.companyId),
        eq(auditLogs.targetType, PREVIEW_EMAIL_AUDIT.targetType),
        eq(auditLogs.targetId, input.params.contractorId),
        eq(auditLogs.action, PREVIEW_EMAIL_AUDIT.inboundTokenGenerated),
      ),
    )
  return row?.setAt ?? null
}

export async function appendPreviewEmailAudit(input: {
  readonly action: string
  readonly actor: PreviewEmailActor
  readonly contractorId: string
  readonly entityId: string
  readonly metadata: Readonly<Record<string, unknown>>
  readonly transaction: PreviewEmailTransaction
}): Promise<void> {
  await input.transaction.insert(auditLogs).values({
    action: input.action,
    actorUserId: input.actor.userId,
    companyId: input.actor.companyId,
    correlationId: input.actor.correlationId,
    entityId: input.entityId,
    entityType: PREVIEW_EMAIL_AUDIT.entityType,
    metadata: { ipAddress: input.actor.ipAddress, ...input.metadata },
    permission: PREVIEW_EMAIL_AUDIT.permission,
    targetId: input.contractorId,
    targetType: PREVIEW_EMAIL_AUDIT.targetType,
  })
}
