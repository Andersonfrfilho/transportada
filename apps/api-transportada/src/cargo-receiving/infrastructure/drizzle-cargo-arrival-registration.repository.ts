/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: registrar a chegada numa transação só. O contratante é travado primeiro: só notas
 * do emitente dele entram, então a trava serializa toda disputa pela mesma nota e pela mesma chave.
 */
import { and, eq } from 'drizzle-orm'

import { cargoArrivalEvents } from '../../database/cargo-arrival-event.schema.js'
import { cargoArrivalDocuments } from '../../database/cargo-arrival-document.schema.js'
import { cargoArrivals } from '../../database/cargo-arrival.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { findPostgresError } from '../../database/postgres-error.support.js'
import {
  CARGO_ARRIVAL_DOCUMENT_STATE,
  CARGO_ARRIVAL_EVENT_KIND,
} from '../../shared/cargo-arrival.constant.js'
import type { CargoArrivalRegistrationRepositoryPort } from '../application/cargo-arrival.port.js'
import type {
  RegisterCargoArrivalRecordParams,
  RegisterCargoArrivalRecordResult,
} from '../application/cargo-arrival-request.types.js'
import { findArrivalCandidateRefusals } from '../domain/cargo-arrival-candidate.policy.js'
import {
  copyArrivalRulesFromProfile,
  resolveSeparationDueAt,
  type CopiedArrivalRules,
} from '../domain/cargo-arrival-transition.policy.js'
import {
  selectArrivalDestinationCities,
  type ArrivalDestinationCity,
} from './cargo-arrival-destination.query.js'
import { selectArrivalCandidateRows } from './cargo-arrival-document.query.js'
import {
  findArrivalProfileRules,
  insertArrivalAudit,
  type Database,
  type Transaction,
} from './cargo-arrival-persistence.support.js'

const IDEMPOTENCY_KEY_CONSTRAINT = 'cargo_arrivals_company_idempotency_key_unique'
const REGISTERED_AUDIT_ACTION = 'cargo-arrival.registered'

type Params = RegisterCargoArrivalRecordParams

export class DrizzleCargoArrivalRegistrationRepository
  implements CargoArrivalRegistrationRepositoryPort
{
  public constructor(private readonly database: Database) {}

  /** A mesma chave por outro contratante não passa pela trava dele: o unique decide, e é reuso. */
  public async register(params: Params): Promise<RegisterCargoArrivalRecordResult> {
    try {
      return await this.database.transaction((transaction) => register(transaction, params))
    } catch (error) {
      if (findPostgresError({ error })?.constraint === IDEMPOTENCY_KEY_CONSTRAINT) {
        return { kind: 'key_reused' }
      }
      throw error
    }
  }
}

async function register(
  transaction: Transaction,
  params: Params,
): Promise<RegisterCargoArrivalRecordResult> {
  const gate = await passRegistrationGate(transaction, params)
  if ('result' in gate) return gate.result

  const rows = await selectArrivalCandidateRows(transaction, params)
  const refusals = findArrivalCandidateRefusals({
    contractorTaxId: gate.contractorTaxId,
    documentIds: params.documentIds,
    rows,
  })
  if (refusals.length > 0) return { kind: 'refused', refusals }

  const arrivalId = await insertArrival(transaction, { params, rules: gate.rules })
  const cities = await selectArrivalDestinationCities(transaction, params)
  await insertDocumentsAndEvents(transaction, { arrivalId, cities, params })
  await insertArrivalAudit(transaction, {
    action: REGISTERED_AUDIT_ACTION,
    actorUserId: params.actorUserId,
    arrivalId,
    companyId: params.companyId,
    contractorId: params.contractorId,
    correlationId: params.correlationId,
    metadata: { documentCount: params.documentIds.length },
  })
  return { arrivalId, kind: 'created' }
}

type RegistrationGate =
  | { readonly result: RegisterCargoArrivalRecordResult }
  | { readonly contractorTaxId: string; readonly rules: CopiedArrivalRules }

/** A chave é procurada antes das notas: na repetição elas já estão na chegada, e seria 422. */
async function passRegistrationGate(
  transaction: Transaction,
  params: Params,
): Promise<RegistrationGate> {
  const [contractor] = await transaction
    .select({ taxId: contractors.taxId })
    .from(contractors)
    .where(
      and(eq(contractors.companyId, params.companyId), eq(contractors.id, params.contractorId)),
    )
    .for('no key update')
  if (contractor === undefined) return { result: { kind: 'contractor_not_found' } }

  const [existing] = await transaction
    .select({ fingerprint: cargoArrivals.requestFingerprint, id: cargoArrivals.id })
    .from(cargoArrivals)
    .where(
      and(
        eq(cargoArrivals.companyId, params.companyId),
        eq(cargoArrivals.idempotencyKey, params.idempotencyKey),
      ),
    )
  if (existing !== undefined) {
    const isSameRequest = existing.fingerprint === params.requestFingerprint
    return {
      result: isSameRequest ? { arrivalId: existing.id, kind: 'replayed' } : { kind: 'key_reused' },
    }
  }

  const rules = copyArrivalRulesFromProfile(
    (await findArrivalProfileRules(transaction, params)) ?? null,
  )
  if (rules === null) return { result: { kind: 'not_enabled' } }
  return { contractorTaxId: contractor.taxId, rules }
}

async function insertArrival(
  transaction: Transaction,
  { params, rules }: { readonly params: Params; readonly rules: CopiedArrivalRules },
): Promise<string> {
  const [arrival] = await transaction
    .insert(cargoArrivals)
    .values({
      arrivedAt: params.arrivedAt,
      channel: params.channel,
      companyId: params.companyId,
      contractorId: params.contractorId,
      deliveryDeadlineBusinessDays: rules.deliveryDeadlineBusinessDays,
      idempotencyKey: params.idempotencyKey,
      palletCount: params.palletCount,
      reference: params.reference,
      registeredByUserId: params.actorUserId,
      requestFingerprint: params.requestFingerprint,
      separationDueAt: resolveSeparationDueAt({
        arrivedAt: params.arrivedAt,
        separationWindowHours: rules.separationWindowHours,
      }),
      separationWindowHours: rules.separationWindowHours,
    })
    .returning({ id: cargoArrivals.id })
  if (arrival === undefined) throw new Error('CARGO_ARRIVAL_INSERT_RETURNED_NOTHING')
  return arrival.id
}

async function insertDocumentsAndEvents(
  transaction: Transaction,
  input: {
    readonly arrivalId: string
    readonly cities: ReadonlyMap<string, ArrivalDestinationCity>
    readonly params: Params
  },
): Promise<void> {
  const { arrivalId, cities, params } = input
  const documents = await transaction
    .insert(cargoArrivalDocuments)
    .values(
      params.documentIds.map((nfeDocumentId) => ({
        arrivalId,
        cityIbgeCode: cities.get(nfeDocumentId)?.cityIbgeCode ?? null,
        companyId: params.companyId,
        nfeDocumentId,
        separationState: CARGO_ARRIVAL_DOCUMENT_STATE.expected,
      })),
    )
    .returning({ id: cargoArrivalDocuments.id })
  const authorship = {
    actorUserId: params.actorUserId,
    arrivalId,
    channel: params.channel,
    companyId: params.companyId,
    occurredAt: params.arrivedAt,
  }
  await transaction.insert(cargoArrivalEvents).values([
    {
      ...authorship,
      details: { documentCount: params.documentIds.length, palletCount: params.palletCount },
      kind: CARGO_ARRIVAL_EVENT_KIND.arrivalRegistered,
    },
    ...documents.map((document) => ({
      ...authorship,
      arrivalDocumentId: document.id,
      kind: CARGO_ARRIVAL_EVENT_KIND.documentAdded,
      toState: CARGO_ARRIVAL_DOCUMENT_STATE.expected,
    })),
  ])
}
