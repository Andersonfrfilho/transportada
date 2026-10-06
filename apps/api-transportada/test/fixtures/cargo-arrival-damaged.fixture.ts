/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2/T3.4a: a chegada de duas notas conferidas, a primeira com avaria de recebimento
 * aberta, e os pedidos da marcação "devolver ao contratante" — compartilhados pelas integrações
 * que conduzem a devolução e a tratativa. Dados inventados.
 */
import {
  hasTestDatabase,
  seedIssuedDocument,
  type CargoTenants,
  type TestDatabase,
} from './cargo-arrival-database.fixture.js'
import {
  buildPostRequest,
  callCargoArrival,
  createCargoArrivalHandler,
} from './cargo-arrival-http.fixture.js'
import { jsonRequest } from './freight-region-http.fixture.js'
import {
  createOccurrenceHandler,
  occurrenceRequest,
  seedOccurrenceType,
  seedProduct,
} from './cargo-arrival-occurrence.fixture.js'

export { hasTestDatabase }

export const ARRIVED_AT = new Date(Date.now() - 2 * 3_600_000)

export type Damaged = {
  readonly arrivalId: string
  readonly documentIds: readonly [string, string]
  readonly occurrenceId: string
}

export async function seedDamaged(database: TestDatabase, tenants: CargoTenants): Promise<Damaged> {
  const documentIds = [
    await seedIssuedDocument(database, { number: '31' }),
    await seedIssuedDocument(database, { number: '32' }),
  ] as const
  await seedProduct(database, { code: 'P1', documentId: documentIds[0], unit: 'CX' })
  const arrivals = createCargoArrivalHandler({ database })
  const registered = await callCargoArrival(
    arrivals,
    buildPostRequest({
      body: {
        arrivedAt: ARRIVED_AT.toISOString(),
        contractorId: tenants.contractorId,
        documentIds,
      },
      key: `arrival-${crypto.randomUUID()}`,
      path: '/cargo-arrivals',
    }),
  )
  const arrivalId = String(registered.body.data?.id)
  await callCargoArrival(
    arrivals,
    buildPostRequest({
      body: { documentIds, to: 'received' },
      path: `/cargo-arrivals/${arrivalId}/documents/batch-status`,
    }),
  )
  const typeId = await seedOccurrenceType(database, { stage: 'receiving' })
  const occurrenceId = await openDamage({
    arrivalId,
    database,
    documentId: documentIds[0],
    typeId,
  })
  return { arrivalId, documentIds, occurrenceId }
}

/** Abre uma avaria de recebimento pela rota real, com o item `P1` da nota. */
export async function openDamage(input: {
  readonly arrivalId: string
  readonly database: TestDatabase
  readonly documentId: string
  readonly typeId: string
}): Promise<string> {
  const created = await createOccurrenceHandler({ database: input.database })(
    occurrenceRequest({
      arrivalId: input.arrivalId,
      documentId: input.documentId,
      fields: { occurrenceTypeId: input.typeId, productCodes: ['P1'] },
      key: `damage-${crypto.randomUUID()}`,
    }),
  )
  return ((await created.json()) as { data: { id: string } }).data.id
}

export type CaseStep = readonly [status: number, outcome: unknown]

export async function caseStep(
  office: ReturnType<typeof createOccurrenceHandler>,
  input: { readonly action: string; readonly body?: unknown; readonly occurrenceId: string },
): Promise<CaseStep> {
  const response = await office(
    jsonRequest({
      body: input.body ?? {},
      method: 'POST',
      path: `/trip-occurrences/${input.occurrenceId}/case/${input.action}`,
    }),
  )
  const body = (await response.json()) as {
    data?: { kind?: string; status?: string }
    error?: { code?: string }
  }
  return [response.status, body.error?.code ?? `${body.data?.kind}:${body.data?.status}`]
}

export type ReturnAction = 'return-complete' | 'return-mark' | 'return-unmark'

export function returnAction(input: {
  readonly action: ReturnAction
  readonly arrivalId: string
  readonly body?: unknown
  readonly documentId: string
}): Request {
  return buildPostRequest({
    body: input.body ?? {},
    path: `/cargo-arrivals/${input.arrivalId}/documents/${input.documentId}/${input.action}`,
  })
}

export async function statusAndCode(response: Response): Promise<readonly [number, unknown]> {
  const body = (await response.json()) as { data?: unknown; error?: { code?: string } }
  return [response.status, body.error?.code ?? (body.data as { outcome?: string }).outcome]
}
