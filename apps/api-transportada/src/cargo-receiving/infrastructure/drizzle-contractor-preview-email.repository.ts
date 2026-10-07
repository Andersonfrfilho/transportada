/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10): o contratante é travado com `for no key update` (serializa duas edições do
 * mesmo perfil sem bloquear quem só cria FK para `contractors`), a troca do hash e a auditoria vão na MESMA
 * transação, e este arquivo só conhece o hash — o token nunca chega aqui.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq } from 'drizzle-orm'

import { cargoPreviewEmailIntakes } from '../../database/cargo-preview-email-intake.schema.js'
import { contractorMailSettings } from '../../database/contractor-mail.schema.js'
import { contractorReceivingProfiles } from '../../database/contractor-receiving-profile.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import type { ContractorPreviewEmailRepositoryPort } from '../application/contractor-preview-email.port.js'
import type {
  FindPreviewEmailParams,
  ListPreviewEmailIntakesRecordParams,
  PreviewEmailIntake,
  PreviewEmailSettings,
  RotatePreviewInboundTokenOutcome,
  RotatePreviewInboundTokenRecordParams,
  SavePreviewEmailAllowlistsOutcome,
  SavePreviewEmailAllowlistsRecordParams,
} from '../application/contractor-preview-email.types.js'
import { PREVIEW_EMAIL_AUDIT } from '../domain/contractor-preview-email.constant.js'
import {
  appendPreviewEmailAudit,
  isSameList,
  missingAllowlistFields,
  PREVIEW_EMAIL_PROFILE_COLUMNS,
  readPreviewEmailSettings,
  toProfileRow,
  type PreviewEmailProfileRow,
  type PreviewEmailTransaction,
} from './contractor-preview-email.support.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleContractorPreviewEmailRepository
  implements ContractorPreviewEmailRepositoryPort
{
  public constructor(private readonly database: Database) {}

  public async read(params: FindPreviewEmailParams): Promise<PreviewEmailSettings | null> {
    if (!(await contractorExists({ executor: this.database, params }))) return null
    const [row] = await this.database
      .select(PREVIEW_EMAIL_PROFILE_COLUMNS)
      .from(contractorReceivingProfiles)
      .where(profileFilter(params))
    return readPreviewEmailSettings({
      executor: this.database,
      params,
      profile: row === undefined ? undefined : toProfileRow(row),
    })
  }

  public async listIntakes(
    params: ListPreviewEmailIntakesRecordParams,
  ): Promise<readonly PreviewEmailIntake[] | null> {
    if (!(await contractorExists({ executor: this.database, params }))) return null
    const rows = await this.database
      .select({
        outcome: cargoPreviewEmailIntakes.outcome,
        previewId: cargoPreviewEmailIntakes.previewId,
        reasonCode: cargoPreviewEmailIntakes.reasonCode,
        receivedAt: cargoPreviewEmailIntakes.receivedAt,
      })
      .from(cargoPreviewEmailIntakes)
      .where(
        and(
          eq(cargoPreviewEmailIntakes.companyId, params.companyId),
          eq(cargoPreviewEmailIntakes.contractorId, params.contractorId),
        ),
      )
      .orderBy(desc(cargoPreviewEmailIntakes.recordedAt), desc(cargoPreviewEmailIntakes.id))
      .limit(params.limit)
    return rows.map((row) => ({ ...row, receivedAt: row.receivedAt.toISOString() }))
  }

  public saveAllowlists(
    params: SavePreviewEmailAllowlistsRecordParams,
  ): Promise<SavePreviewEmailAllowlistsOutcome> {
    const { actor, contractorId } = params
    const scope = { companyId: actor.companyId, contractorId }
    return this.database.transaction(async (transaction) => {
      const existing = await lockProfile({ params: scope, transaction })
      if (existing === 'contractor_not_found') return { status: 'contractor_not_found' }

      const requested = {
        forwarderAllowlist: params.forwarderAllowlist,
        senderAllowlist: params.senderAllowlist,
      }
      const missing = missingAllowlistFields(requested)
      if (existing?.hasInboundToken === true && missing.length > 0) {
        return { missing, status: 'allowlists_required' }
      }
      const isUnchanged =
        isSameList(existing?.forwarderAllowlist ?? [], requested.forwarderAllowlist) &&
        isSameList(existing?.senderAllowlist ?? [], requested.senderAllowlist)
      if (!isUnchanged) {
        const saved = await upsertAllowlists({ params: scope, requested, transaction })
        await appendPreviewEmailAudit({
          action: PREVIEW_EMAIL_AUDIT.allowlistsSaved,
          actor,
          contractorId,
          entityId: saved,
          metadata: {
            after: requested,
            before: {
              forwarderAllowlist: existing?.forwarderAllowlist ?? [],
              senderAllowlist: existing?.senderAllowlist ?? [],
            },
          },
          transaction,
        })
      }
      const profile = await lockProfile({ params: scope, transaction })
      return {
        settings: await readPreviewEmailSettings({
          executor: transaction,
          params: scope,
          profile: profile === 'contractor_not_found' ? undefined : profile,
        }),
        status: 'saved',
      }
    })
  }

  public rotateInboundToken(
    params: RotatePreviewInboundTokenRecordParams,
  ): Promise<RotatePreviewInboundTokenOutcome> {
    const { actor, contractorId } = params
    const scope = { companyId: actor.companyId, contractorId }
    return this.database.transaction(async (transaction) => {
      const existing = await lockProfile({ params: scope, transaction })
      if (existing === 'contractor_not_found') return { status: 'contractor_not_found' }

      const missing = missingAllowlistFields(
        existing ?? { forwarderAllowlist: null, senderAllowlist: null },
      )
      if (existing === undefined || missing.length > 0) {
        return { missing, status: 'allowlists_missing' }
      }
      const [mail] = await transaction
        .select({ replyDomain: contractorMailSettings.replyDomain })
        .from(contractorMailSettings)
        .where(eq(contractorMailSettings.companyId, actor.companyId))
      if (mail === undefined) return { status: 'domain_not_configured' }

      await transaction
        .update(contractorReceivingProfiles)
        .set({ previewInboundTokenHash: params.tokenHash, updatedAt: new Date() })
        .where(profileFilter(scope))
      await appendPreviewEmailAudit({
        action: PREVIEW_EMAIL_AUDIT.inboundTokenGenerated,
        actor,
        contractorId,
        entityId: existing.id,
        metadata: { isRotation: existing.hasInboundToken },
        transaction,
      })
      return {
        isRotation: existing.hasInboundToken,
        replyDomain: mail.replyDomain,
        status: 'rotated',
      }
    })
  }
}

function profileFilter(params: FindPreviewEmailParams) {
  return and(
    eq(contractorReceivingProfiles.companyId, params.companyId),
    eq(contractorReceivingProfiles.contractorId, params.contractorId),
  )
}

async function contractorExists(input: {
  readonly executor: Database | PreviewEmailTransaction
  readonly params: FindPreviewEmailParams
}): Promise<boolean> {
  const [row] = await input.executor
    .select({ id: contractors.id })
    .from(contractors)
    .where(
      and(
        eq(contractors.companyId, input.params.companyId),
        eq(contractors.id, input.params.contractorId),
      ),
    )
  return row !== undefined
}

/** Trava o contratante e o perfil dele; `undefined` é contratante sem perfil ainda. */
async function lockProfile(input: {
  readonly params: FindPreviewEmailParams
  readonly transaction: PreviewEmailTransaction
}): Promise<PreviewEmailProfileRow | 'contractor_not_found' | undefined> {
  const { params, transaction } = input
  const [contractor] = await transaction
    .select({ id: contractors.id })
    .from(contractors)
    .where(
      and(eq(contractors.companyId, params.companyId), eq(contractors.id, params.contractorId)),
    )
    .for('no key update')
  if (contractor === undefined) return 'contractor_not_found'

  const [row] = await transaction
    .select(PREVIEW_EMAIL_PROFILE_COLUMNS)
    .from(contractorReceivingProfiles)
    .where(profileFilter(params))
    .for('update')
  return row === undefined ? undefined : toProfileRow(row)
}

async function upsertAllowlists(input: {
  readonly params: FindPreviewEmailParams
  readonly requested: {
    readonly forwarderAllowlist: readonly string[]
    readonly senderAllowlist: readonly string[]
  }
  readonly transaction: PreviewEmailTransaction
}): Promise<string> {
  const columns = {
    previewForwarderAllowlist: toColumn(input.requested.forwarderAllowlist),
    previewSenderAllowlist: toColumn(input.requested.senderAllowlist),
  }
  const [row] = await input.transaction
    .insert(contractorReceivingProfiles)
    .values({ ...columns, ...input.params })
    .onConflictDoUpdate({
      set: { ...columns, updatedAt: new Date() },
      target: [contractorReceivingProfiles.companyId, contractorReceivingProfiles.contractorId],
    })
    .returning({ id: contractorReceivingProfiles.id })
  if (row === undefined) throw new Error('CONTRACTOR_PREVIEW_EMAIL_UPSERT_RETURNED_NOTHING')
  return row.id
}

/** Lista vazia é "sem lista": o banco guarda nulo, e o CHECK recusa vazia. */
function toColumn(entries: readonly string[]): string[] | null {
  return entries.length === 0 ? null : [...entries]
}
