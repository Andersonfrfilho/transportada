/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildCtePayload } from '../../src/cte-issuance/domain/cte-payload.builder.js'
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
