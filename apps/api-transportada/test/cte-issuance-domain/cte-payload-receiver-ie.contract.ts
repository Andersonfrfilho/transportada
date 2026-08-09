/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildCtePayload,
  resolveCtePayloadTaker,
} from '../../src/cte-issuance/domain/cte-payload.builder.js'
import type { CtePayloadParty } from '../../src/cte-issuance/domain/cte-payload.types.js'

import {
  GOLDEN_INVOICE,
  GOLDEN_PROFILE,
  GOLDEN_RECIPIENT,
  GOLDEN_SENDER,
  buildGoldenParams,
  expectApiErrorCode,
} from './support.js'

// Congelados do <ide> de uma CT-e autorizada de referência: o XML é documento fiscal de
// terceiro e vive fora do repositório, então o valor entra aqui como o resto do golden.
const REFERENCE_IDE = { indIEToma: '1', toma: '0' } as const

function withInvoiceParty(party: {
  readonly recipient?: CtePayloadParty
  readonly sender?: CtePayloadParty
}) {
  return [
    {
      ...GOLDEN_INVOICE,
      recipient: party.recipient ?? GOLDEN_RECIPIENT,
      sender: party.sender ?? GOLDEN_SENDER,
    },
  ]
}

describe('buildCtePayload — indIEToma derivado da inscrição estadual do tomador', () => {
  test('reproduz o indIEToma e o tomador da CT-e de referência', () => {
    const payload = buildCtePayload(buildGoldenParams())

    expect(payload.tomador).toBe(REFERENCE_IDE.toma)
    expect(payload.indIEToma ?? '').toBe(REFERENCE_IDE.indIEToma)
  })

  test('deriva do destinatário quando o tomador configurado é o destinatário', () => {
    const payload = buildCtePayload(
      buildGoldenParams({
        invoices: withInvoiceParty({ sender: { ...GOLDEN_SENDER, stateRegistration: null } }),
        profile: { ...GOLDEN_PROFILE, receiverIeIndicator: '9', taker: '3' },
      }),
    )

    expect(payload.indIEToma).toBe('1')
  })

  test('marca isento quando a inscrição estadual do tomador é ISENTO', () => {
    const payload = buildCtePayload(
      buildGoldenParams({
        invoices: withInvoiceParty({ sender: { ...GOLDEN_SENDER, stateRegistration: 'ISENTO' } }),
        profile: { ...GOLDEN_PROFILE, receiverIeIndicator: '1' },
      }),
    )

    expect(payload.indIEToma).toBe('2')
  })

  test('usa o indicador configurado no perfil quando o tomador não tem inscrição estadual', () => {
    const invoices = withInvoiceParty({ sender: { ...GOLDEN_SENDER, stateRegistration: null } })

    expect(
      buildCtePayload(
        buildGoldenParams({
          invoices,
          profile: { ...GOLDEN_PROFILE, receiverIeIndicator: '9' },
        }),
      ).indIEToma,
    ).toBe('9')
    expect(
      buildCtePayload(
        buildGoldenParams({
          invoices,
          profile: { ...GOLDEN_PROFILE, receiverIeIndicator: '2' },
        }),
      ).indIEToma,
    ).toBe('2')
  })

  test('trata tomador pessoa física sem inscrição estadual como não contribuinte', () => {
    const payload = buildCtePayload(
      buildGoldenParams({
        invoices: withInvoiceParty({
          sender: { ...GOLDEN_SENDER, stateRegistration: null, taxId: '12345678909' },
        }),
        profile: { ...GOLDEN_PROFILE, receiverIeIndicator: '1' },
      }),
    )

    expect(payload.indIEToma).toBe('9')
  })

  test('recusa declarar tomador contribuinte sem inscrição estadual', () => {
    expectApiErrorCode(
      () =>
        buildCtePayload(
          buildGoldenParams({
            invoices: withInvoiceParty({ sender: { ...GOLDEN_SENDER, stateRegistration: '  ' } }),
            profile: { ...GOLDEN_PROFILE, receiverIeIndicator: '1' },
          }),
        ),
      'CTE_PAYLOAD_RECEIVER_IE_UNAVAILABLE',
    )
  })

  test('recusa tomador expedidor ou recebedor, que o payload não modela', () => {
    for (const taker of ['1', '2'] as const) {
      expectApiErrorCode(
        () => buildCtePayload(buildGoldenParams({ profile: { ...GOLDEN_PROFILE, taker } })),
        'CTE_PAYLOAD_UNSUPPORTED_TAKER',
      )
    }
  })
})

/**
 * Quem paga o frete é o cliente da fatura, e quem é ele está no perfil de emissão — não num papel
 * cravado no faturamento. Uma transportadora que cobra do remetente e outra que cobra do
 * destinatário usam o mesmo código; muda o `taker` do perfil.
 */
describe('resolveCtePayloadTaker — o tomador vem do perfil de emissão', () => {
  test('devolve o remetente quando o perfil cobra do remetente', () => {
    const taker = resolveCtePayloadTaker({
      invoices: [GOLDEN_INVOICE],
      profile: { ...GOLDEN_PROFILE, taker: '0' },
    })

    expect(taker.legalName).toBe(GOLDEN_SENDER.legalName)
    expect(taker.taxId).toBe(GOLDEN_SENDER.taxId)
  })

  test('devolve o destinatário quando o perfil cobra do destinatário', () => {
    const taker = resolveCtePayloadTaker({
      invoices: [GOLDEN_INVOICE],
      profile: { ...GOLDEN_PROFILE, taker: '3' },
    })

    expect(taker.legalName).toBe(GOLDEN_RECIPIENT.legalName)
    expect(taker.taxId).toBe(GOLDEN_RECIPIENT.taxId)
  })

  test('concorda com o tomador que o payload declara, para não haver duas leituras', () => {
    for (const taker of ['0', '3'] as const) {
      const profile = { ...GOLDEN_PROFILE, taker }
      const payload = buildCtePayload(buildGoldenParams({ profile }))
      const resolved = resolveCtePayloadTaker({ invoices: [GOLDEN_INVOICE], profile })
      const declared = taker === '0' ? payload.remetente : payload.destinatario

      expect(payload.tomador).toBe(taker)
      expect(resolved.legalName).toBe(declared.xNome)
    }
  })

  test('recusa o mesmo tomador não modelado que o payload recusa', () => {
    for (const taker of ['1', '2'] as const) {
      expectApiErrorCode(
        () =>
          resolveCtePayloadTaker({
            invoices: [GOLDEN_INVOICE],
            profile: { ...GOLDEN_PROFILE, taker },
          }),
        'CTE_PAYLOAD_UNSUPPORTED_TAKER',
      )
    }
  })

  test('recusa seleção vazia, que não tem nota de referência para dizer quem paga', () => {
    expectApiErrorCode(
      () => resolveCtePayloadTaker({ invoices: [], profile: GOLDEN_PROFILE }),
      'CTE_PAYLOAD_EMPTY_SELECTION',
    )
  })
})
