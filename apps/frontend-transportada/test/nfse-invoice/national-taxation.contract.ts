/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR } from '../../src/modules/nfse-invoice/shared/nfseInvoice.constant'
import {
  profileFromApi,
  profileListFromApi,
} from '../../src/modules/nfse-invoice/shared/nfseSettingsResponse.validation'
import { createNfseInvoiceResponseAdapters } from '../../src/modules/nfse-invoice/shared/nfseInvoiceResponse.validation'
import {
  NFSE_NATIONAL_TAXATION_MISSING_ERROR,
  findNationalTaxationFieldErrors,
  formatSimplesNationalRate,
  selectNfseReissueFailureKey,
  toSimplesNationalRate,
} from '../../src/modules/nfse-invoice/shared/nfseNationalTaxation.service'
import {
  EMPTY_NFSE_PROFILE_DRAFT,
  NFSE_PROFILE_BLOCK_REASON,
  buildNfseProfileSubmission,
  toNfseProfileDraft,
} from '../../src/modules/nfse-invoice/shared/nfseProfileForm.service'
import { buildNfseReissueCorrectionBody } from '../../src/modules/nfse-invoice/shared/nfseInvoiceRowActions.service'
import { summarizeNfseBulkReissue } from '../../src/modules/nfse-invoice/shared/nfseInvoiceBulkReissue.service'

import { INVOICE_DETAIL, LAST_ISSUANCE_PAYLOAD } from './nfse-invoice.fixture'

const PROFILE_RESPONSE = {
  chargeComponentLabel: 'Frete',
  cnaeCode: '4930202',
  companyId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e97',
  createdAt: '2026-08-01T00:00:00.000Z',
  descriptionMaxLength: '2000',
  descriptionTemplate: 'Transporte {{periodo}}',
  freightRuleId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e95',
  id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e94',
  issExigibility: '1',
  issRate: '0.020000',
  issWithheld: false,
  municipalTaxationCode: '160101',
  municipalityIbgeCode: '3543402',
  municipalityName: 'Ribeirão Preto',
  name: 'Perfil',
  nbsCode: '',
  observations: '',
  serviceListItem: '16.02',
  status: 'active',
  taker: '0',
  updatedAt: '2026-08-02T00:00:00.000Z',
  version: '3',
} as const

describe('código de tributação nacional e alíquota do Simples (spec 250 T4.1)', () => {
  test('o código tem seis dígitos; vazio é válido porque a API decide por versão', () => {
    const invalid = (nationalTaxationCode: string) =>
      findNationalTaxationFieldErrors({ nationalTaxationCode, simplesNationalRate: '' }).code

    expect(invalid('')).toBe(false)
    expect(invalid('160201')).toBe(false)
    expect(invalid(' 160201 ')).toBe(false)
    expect(invalid('16020')).toBe(true)
    expect(invalid('1602011')).toBe(true)
    expect(invalid('16.201')).toBe(true)
    expect(invalid('abcdef')).toBe(true)
  })

  test('a alíquota é percentual de 0 a 100 com até seis casas, vírgula ou ponto', () => {
    expect(toSimplesNationalRate('2')).toBe('2')
    expect(toSimplesNationalRate('4,5')).toBe('4.5')
    expect(toSimplesNationalRate(' 4.500000 ')).toBe('4.500000')
    expect(toSimplesNationalRate('100')).toBe('100')
    expect(toSimplesNationalRate('100,000000')).toBe('100.000000')
    expect(toSimplesNationalRate('0')).toBe('0')
    expect(toSimplesNationalRate('100,1')).toBeNull()
    expect(toSimplesNationalRate('101')).toBeNull()
    expect(toSimplesNationalRate('-1')).toBeNull()
    expect(toSimplesNationalRate('1,1234567')).toBeNull()
    expect(toSimplesNationalRate('1e2')).toBeNull()
    expect(toSimplesNationalRate('')).toBeNull()
  })

  test('a alíquota de leitura perde só os zeros à direita, sem passar por float', () => {
    expect(formatSimplesNationalRate('2.000000')).toBe('2')
    expect(formatSimplesNationalRate('4.500000')).toBe('4,5')
    expect(formatSimplesNationalRate('4.123456')).toBe('4,123456')
    expect(formatSimplesNationalRate('100.000000')).toBe('100')
    expect(formatSimplesNationalRate('')).toBe('')
  })

  test('os dois campos vazios viram null no corpo; preenchidos vão normalizados', () => {
    const draft = toNfseProfileDraft(PROFILE_RESPONSE)
    expect(draft.nationalTaxationCode).toBe('')
    expect(draft.simplesNationalRate).toBe('')

    const empty = buildNfseProfileSubmission(draft)
    expect(empty.status === 'ready' && empty.settings.nationalTaxationCode).toBeNull()
    expect(empty.status === 'ready' && empty.settings.simplesNationalRate).toBeNull()

    const filled = buildNfseProfileSubmission({
      ...draft,
      nationalTaxationCode: ' 160201 ',
      simplesNationalRate: '4,5',
    })
    expect(filled.status === 'ready' && filled.settings.nationalTaxationCode).toBe('160201')
    expect(filled.status === 'ready' && filled.settings.simplesNationalRate).toBe('4.5')
  })

  test('valor inválido bloqueia o envio com razão nomeada, sem ser obrigatório', () => {
    const draft = toNfseProfileDraft(PROFILE_RESPONSE)

    expect(buildNfseProfileSubmission({ ...draft, nationalTaxationCode: '1602' })).toEqual({
      reason: NFSE_PROFILE_BLOCK_REASON.NATIONAL_TAXATION_CODE_INVALID,
      status: 'blocked',
    })
    expect(buildNfseProfileSubmission({ ...draft, simplesNationalRate: '101' })).toEqual({
      reason: NFSE_PROFILE_BLOCK_REASON.SIMPLES_NATIONAL_RATE_INVALID,
      status: 'blocked',
    })
    expect(EMPTY_NFSE_PROFILE_DRAFT.nationalTaxationCode).toBe('')
    expect(EMPTY_NFSE_PROFILE_DRAFT.simplesNationalRate).toBe('')
  })

  test('o perfil devolvido pela API volta ao formulário em percentual legível', () => {
    const draft = toNfseProfileDraft({
      ...PROFILE_RESPONSE,
      nationalTaxationCode: '160201',
      simplesNationalRate: '2.000000',
    })

    expect(draft.nationalTaxationCode).toBe('160201')
    expect(draft.simplesNationalRate).toBe('2')
  })

  test('a resposta aceita os dois campos presentes, nulos ou ausentes, e recusa valor fora do formato', () => {
    expect(profileFromApi({ data: PROFILE_RESPONSE }).id).toBe(PROFILE_RESPONSE.id)
    expect(
      profileFromApi({
        data: { ...PROFILE_RESPONSE, nationalTaxationCode: null, simplesNationalRate: null },
      }).id,
    ).toBe(PROFILE_RESPONSE.id)
    expect(
      profileListFromApi({
        data: [{ ...PROFILE_RESPONSE, nationalTaxationCode: '160201', simplesNationalRate: '4.5' }],
      }),
    ).toHaveLength(1)
    expect(() =>
      profileFromApi({ data: { ...PROFILE_RESPONSE, nationalTaxationCode: '1602' } }),
    ).toThrow()
    expect(() =>
      profileFromApi({ data: { ...PROFILE_RESPONSE, simplesNationalRate: 2 } }),
    ).toThrow()
    expect(() => profileFromApi({ data: { ...PROFILE_RESPONSE, companyToken: 'x' } })).toThrow()
  })
})

describe('reemissão corrige o par nacional só quando alterado (spec 250 T4.2)', () => {
  const FROZEN = {
    ...LAST_ISSUANCE_PAYLOAD,
    nationalTaxationCode: '160201',
    simplesNationalRate: '2.000000',
  }

  test('o detalhe aceita o payload congelado com e sem os dois campos', () => {
    const adapters = createNfseInvoiceResponseAdapters()
    const invoiceDetailFromApi = (
      value: unknown,
    ): ReturnType<typeof adapters.invoiceDetailFromApi> => adapters.invoiceDetailFromApi(value)

    expect(invoiceDetailFromApi({ ...INVOICE_DETAIL, lastPayload: FROZEN }).lastPayload).toEqual(
      FROZEN,
    )
    expect(
      invoiceDetailFromApi({ ...INVOICE_DETAIL, lastPayload: LAST_ISSUANCE_PAYLOAD }).lastPayload,
    ).toEqual(LAST_ISSUANCE_PAYLOAD)
    expect(() =>
      invoiceDetailFromApi({
        ...INVOICE_DETAIL,
        lastPayload: { ...FROZEN, simplesNationalRate: 2 },
      }),
    ).toThrow()
  })

  test('sem edição o corpo é vazio; o valor igual ao congelado não vai', () => {
    expect(buildNfseReissueCorrectionBody({ edited: {}, lastPayload: FROZEN })).toEqual({})
    expect(
      buildNfseReissueCorrectionBody({
        edited: { nationalTaxationCode: '160201', simplesNationalRate: '2' },
        lastPayload: FROZEN,
      }),
    ).toEqual({})
  })

  test('só o que mudou entra, com a alíquota no formato da API', () => {
    expect(
      buildNfseReissueCorrectionBody({
        edited: { nationalTaxationCode: '160101' },
        lastPayload: FROZEN,
      }),
    ).toEqual({ nationalTaxationCode: '160101' })
    expect(
      buildNfseReissueCorrectionBody({
        edited: { simplesNationalRate: '4,5' },
        lastPayload: FROZEN,
      }),
    ).toEqual({ simplesNationalRate: '4.5' })
  })

  test('nota sem o par congelado: preencher envia, deixar vazio não envia', () => {
    expect(
      buildNfseReissueCorrectionBody({
        edited: { nationalTaxationCode: '160201', simplesNationalRate: '4,5' },
        lastPayload: LAST_ISSUANCE_PAYLOAD,
      }),
    ).toEqual({ nationalTaxationCode: '160201', simplesNationalRate: '4.5' })
    expect(
      buildNfseReissueCorrectionBody({
        edited: { nationalTaxationCode: '', simplesNationalRate: ' ' },
        lastPayload: LAST_ISSUANCE_PAYLOAD,
      }),
    ).toEqual({})
  })

  test('os campos antigos seguem comparados como antes', () => {
    expect(
      buildNfseReissueCorrectionBody({
        edited: { cnaeCode: '4930203', issWithheld: LAST_ISSUANCE_PAYLOAD.issWithheld },
        lastPayload: FROZEN,
      }),
    ).toEqual({ cnaeCode: '4930203' })
  })
})

describe('erro 409 do par nacional ausente (spec 250 T4.2)', () => {
  test('o código tem tradução de feedback e a reemissão aponta para ela', () => {
    expect(NFSE_NATIONAL_TAXATION_MISSING_ERROR).toBe('NFSE_NATIONAL_TAXATION_CODE_MISSING')
    expect(NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR[NFSE_NATIONAL_TAXATION_MISSING_ERROR]).toBe(
      'nationalTaxationMissing',
    )
    expect(selectNfseReissueFailureKey(NFSE_NATIONAL_TAXATION_MISSING_ERROR)).toBe(
      'feedback.nationalTaxationMissing',
    )
  })

  test('qualquer outro erro, ou nenhum, cai na mensagem genérica da reemissão', () => {
    expect(selectNfseReissueFailureKey('NFSE_INVOICE_IN_FLIGHT')).toBe('reissueDialog.failed')
    expect(selectNfseReissueFailureKey(null)).toBe('reissueDialog.failed')
  })

  test('o lote conta à parte as notas barradas por falta do par', () => {
    expect(
      summarizeNfseBulkReissue([
        { errorCode: null, invoiceId: 'a', isReissued: true },
        { errorCode: NFSE_NATIONAL_TAXATION_MISSING_ERROR, invoiceId: 'b', isReissued: false },
        { errorCode: NFSE_NATIONAL_TAXATION_MISSING_ERROR, invoiceId: 'c', isReissued: false },
        { errorCode: 'NFSE_INVOICE_IN_FLIGHT', invoiceId: 'd', isReissued: false },
      ]),
    ).toEqual({ failed: 3, missingNationalTaxation: 2, reissued: 1, total: 4 })
  })
})
