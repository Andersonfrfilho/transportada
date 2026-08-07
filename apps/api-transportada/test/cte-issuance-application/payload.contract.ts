/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  GROUPED_ACCESS_KEYS,
  GROUPED_RECIPIENT,
  GROUPED_SENDER,
} from '../cte-issuance-domain/grouped.support.js'
import { GOLDEN_ACCESS_KEY, GOLDEN_PROFILE, GOLDEN_SENDER } from '../cte-issuance-domain/support.js'

import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  CteIssuanceUnitOfWorkFixture,
  GROUPED_PAYLOAD_SOURCE,
  IDEMPOTENCY_KEY,
  ISSUE_COMMAND_RESULT,
  PAYLOAD_EMITTER,
  PAYLOAD_SOURCE,
  REPROCESS_IDEMPOTENCY_KEY,
  captureApiError,
  createCteIssuanceUseCaseForTest,
} from './support.js'

const SHA256_PATTERN = /^[0-9a-f]{64}$/
const FORBIDDEN_SECRET_MARKERS = ['certificado', 'certificate', 'senha', 'password', 'privatekey']

const ISSUE_INPUT = {
  batchId: BATCH_ID,
  context: COMPANY_CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
}

const REPROCESS_INPUT = {
  batchId: BATCH_ID,
  batchItemId: BATCH_ITEM_ID,
  context: COMPANY_CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: REPROCESS_IDEMPOTENCY_KEY,
}

describe('CT-e issuance payload assembly contract', () => {
  test('persists the transmittable CT-e payload for the created attempt', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    expect(unitOfWork.payloadSourceQueries).toEqual([
      { batchId: BATCH_ID, batchItemId: BATCH_ITEM_ID, companyId: COMPANY_CONTEXT.companyId },
    ])
    expect(unitOfWork.savedPayloads).toHaveLength(1)
    expect(unitOfWork.savedPayloads[0]).toMatchObject({
      attemptId: ISSUE_COMMAND_RESULT.attemptId,
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
    })
    expect(unitOfWork.savedPayloads[0]?.['payload']).toMatchObject({
      cfop: '5353',
      documentos: [{ chave: GOLDEN_ACCESS_KEY, tipo: 'nfe' }],
      modal: { modal: '01', rntrc: PAYLOAD_EMITTER.rntrc },
      remetente: { cnpj: GOLDEN_SENDER.taxId },
      valorTotalPrestacao: 43.13,
      valorTotalReceber: 43.13,
    })
  })

  test('fills every provider config field from the company fiscal profile and the attempt', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    const providerConfig = unitOfWork.savedPayloads[0]?.['providerConfig'] as Record<
      string,
      unknown
    >

    expect(providerConfig).toEqual({
      bairro: PAYLOAD_EMITTER.district,
      cep: PAYLOAD_EMITTER.postalCode,
      cnpj: PAYLOAD_EMITTER.cnpj,
      codigoMunicipio: PAYLOAD_EMITTER.cityIbgeCode,
      complemento: PAYLOAD_EMITTER.complement,
      crt: PAYLOAD_EMITTER.taxRegime,
      environment: ISSUE_COMMAND_RESULT.fiscalEnvironment,
      inscricaoEstadual: PAYLOAD_EMITTER.stateRegistration,
      logradouro: PAYLOAD_EMITTER.street,
      model: 'cte',
      municipio: PAYLOAD_EMITTER.city,
      numero: PAYLOAD_EMITTER.number,
      numeroCte: Number(ISSUE_COMMAND_RESULT.fiscalNumber),
      razaoSocial: PAYLOAD_EMITTER.legalName,
      rntrc: PAYLOAD_EMITTER.rntrc,
      serie: ISSUE_COMMAND_RESULT.fiscalSeries,
      telefone: PAYLOAD_EMITTER.phone,
      uf: PAYLOAD_EMITTER.state,
    })
    expect(Object.values(providerConfig).filter((value) => value === '')).toEqual([])
  })

  // Telefone e complemento são opcionais no cadastro: mandar string vazia gera tag vazia no XML.
  test('omits the optional emitter fields the company left blank', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.payloadSource = {
      ...PAYLOAD_SOURCE,
      emitter: { ...PAYLOAD_EMITTER, complement: '', phone: '' },
    }
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    const providerConfig = unitOfWork.savedPayloads[0]?.['providerConfig'] as Record<
      string,
      unknown
    >

    expect(providerConfig).not.toHaveProperty('telefone')
    expect(providerConfig).not.toHaveProperty('complemento')
  })

  test('keeps certificate material out of the persisted payload', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    const serialized = JSON.stringify(unitOfWork.savedPayloads).toLowerCase()

    for (const marker of FORBIDDEN_SECRET_MARKERS) {
      expect(serialized).not.toContain(marker)
    }
  })

  test('fingerprints the payload with a stable sha256 digest', async () => {
    const first = new CteIssuanceUnitOfWorkFixture()
    const second = new CteIssuanceUnitOfWorkFixture()

    await (await createCteIssuanceUseCaseForTest(first)).issue(ISSUE_INPUT)
    await (await createCteIssuanceUseCaseForTest(second)).issue(ISSUE_INPUT)

    const digest = first.savedPayloads[0]?.['payloadSha256'] as string

    expect(digest).toMatch(SHA256_PATTERN)
    expect(second.savedPayloads[0]?.['payloadSha256']).toBe(digest)
  })

  test('carries a grouped selection of three invoices into the persisted payload', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.payloadSource = GROUPED_PAYLOAD_SOURCE
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    const payload = unitOfWork.savedPayloads[0]?.['payload'] as Record<string, unknown>

    expect(payload['documentos']).toEqual([
      { chave: GROUPED_ACCESS_KEYS[0], tipo: 'nfe' },
      { chave: GROUPED_ACCESS_KEYS[1], tipo: 'nfe' },
      { chave: GROUPED_ACCESS_KEYS[2], tipo: 'nfe' },
    ])
    expect(payload['carga']).toMatchObject({ vCarga: 430.5 })
    expect(payload['remetente']).toMatchObject({ cnpj: GROUPED_SENDER.taxId })
    expect(payload['destinatario']).toMatchObject({ cnpj: GROUPED_RECIPIENT.taxId })
  })

  test('fingerprints a grouped attempt apart from a single invoice attempt', async () => {
    const first = new CteIssuanceUnitOfWorkFixture()
    const second = new CteIssuanceUnitOfWorkFixture()
    const single = new CteIssuanceUnitOfWorkFixture()
    first.payloadSource = GROUPED_PAYLOAD_SOURCE
    second.payloadSource = GROUPED_PAYLOAD_SOURCE

    await (await createCteIssuanceUseCaseForTest(first)).issue(ISSUE_INPUT)
    await (await createCteIssuanceUseCaseForTest(second)).issue(ISSUE_INPUT)
    await (await createCteIssuanceUseCaseForTest(single)).issue(ISSUE_INPUT)

    const digest = first.savedPayloads[0]?.['payloadSha256'] as string

    expect(digest).toMatch(SHA256_PATTERN)
    expect(second.savedPayloads[0]?.['payloadSha256']).toBe(digest)
    expect(single.savedPayloads[0]?.['payloadSha256']).not.toBe(digest)
  })

  test('takes the provider CRT from the company fiscal profile, never from a fixed value', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.payloadSource = {
      ...PAYLOAD_SOURCE,
      emitter: { ...PAYLOAD_EMITTER, taxRegime: '3' },
    }
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    const providerConfig = unitOfWork.savedPayloads[0]?.['providerConfig'] as Record<
      string,
      unknown
    >

    expect(providerConfig['crt']).toBe('3')
    expect(providerConfig['crt']).not.toBe(PAYLOAD_EMITTER.taxRegime)
  })

  test('rejects issuance when the company has no tax regime recorded', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.payloadSource = { ...PAYLOAD_SOURCE, emitter: { ...PAYLOAD_EMITTER, taxRegime: '' } }
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.issue(ISSUE_INPUT))

    expect(error).toMatchObject({ code: 'CTE_ISSUANCE_EMITTER_INCOMPLETE', status: 422 })
    expect(unitOfWork.savedPayloads).toEqual([])
  })

  // <ICMSSN><indSN>1</indSN> é decisão do CteXmlBuilder do pacote a partir do crt — não do payload.
  test('emits only cst 90 for a Simples Nacional profile, without any ICMSSN field', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    const payload = unitOfWork.savedPayloads[0]?.['payload'] as Record<string, unknown>

    expect(GOLDEN_PROFILE.icmsCst).toBe('90')
    expect(GOLDEN_PROFILE.icmsRate).toBe('0.000000')
    expect(payload['icms']).toEqual({ cst: '90' })
    expect(JSON.stringify(payload)).not.toContain('indSN')
    expect(JSON.stringify(payload)).not.toContain('ICMSSN')
  })

  test('rejects issuance when the batch item has no payload source', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.payloadSource = null
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.issue(ISSUE_INPUT))

    expect(error).toMatchObject({ code: 'CTE_ISSUANCE_PAYLOAD_SOURCE_MISSING', status: 422 })
    expect(unitOfWork.savedPayloads).toEqual([])
  })

  test('rejects issuance when the company fiscal profile is incomplete', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.payloadSource = {
      ...PAYLOAD_SOURCE,
      emitter: { ...PAYLOAD_EMITTER, stateRegistration: '' },
    }
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.issue(ISSUE_INPUT))

    expect(error).toMatchObject({ code: 'CTE_ISSUANCE_EMITTER_INCOMPLETE', status: 422 })
    expect(unitOfWork.savedPayloads).toEqual([])
  })

  test('persists a payload for every reprocess attempt', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = unitOfWork.rejectedIssuance
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.reprocess(REPROCESS_INPUT)

    expect(unitOfWork.savedPayloads).toHaveLength(1)
    expect(unitOfWork.savedPayloads[0]).toMatchObject({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
    })
  })
})
