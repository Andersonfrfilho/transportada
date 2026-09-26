/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { DriverDeliveryProofSettings } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  buildReceiverFields,
  DEFAULT_PROOF_SETTINGS,
  listAllPendingFields,
  maskReceiverDocument,
  resolveProofFormPlan,
} from '@/modules/driver-trip/shared/proofFormPlan.service'

function settings(
  overrides: Partial<DriverDeliveryProofSettings> = {},
): DriverDeliveryProofSettings {
  return { ...DEFAULT_PROOF_SETTINGS, ...overrides }
}

function readComponentSource(): string {
  return readFileSync(
    new URL(
      '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
      import.meta.url,
    ),
    'utf8',
  )
}

/**
 * Pedido do usuário (25/09, spec 207): o documento de quem recebeu aparece SEMPRE, como opcional
 * por padrão — "off"/"optional" nunca escondem o campo, só "required" muda o rótulo e a pendência.
 */
describe('o documento de quem recebeu aparece sempre (spec 207)', () => {
  it('rendersReceiverDocument é true mesmo com a configuração off — o campo nunca some', () => {
    expect(resolveProofFormPlan(null).rendersReceiverDocument).toBe(true)
    expect(resolveProofFormPlan(settings({ receiverDocument: 'off' })).rendersReceiverDocument).toBe(
      true,
    )
    expect(
      resolveProofFormPlan(settings({ receiverDocument: 'required' })).rendersReceiverDocument,
    ).toBe(true)
  })

  it('DriverStopCard nunca condiciona o campo a plan.rendersReceiverDocument', () => {
    const card = readComponentSource()
    expect(card).not.toContain('plan.rendersReceiverDocument ?')
  })
})

/**
 * Regra da máscara (pedido do usuário, 25/09): CPF (11 dígitos) e CNPJ (12 alfanuméricos + 2
 * dígitos) têm forma fixa e ganham máscara; RG varia por estado (comprimento, letra de dígito
 * verificador) e NÃO tem forma fixa — fora de CPF/CNPJ completos, o campo aceita dígito e letra
 * sem máscara, exatamente como digitado (só maiúsculo e sem separador).
 */
describe('a máscara do documento de quem recebeu — CPF, CNPJ e RG (spec 207)', () => {
  const cases: ReadonlyArray<readonly [label: string, input: string, expected: string]> = [
    ['CPF completo (11 dígitos)', '39053344705', '390.533.447-05'],
    ['CPF completo, já com máscara parcial', '390.533.447-05', '390.533.447-05'],
    ['CNPJ completo (12 alfanuméricos + 2 dígitos)', '12abc345000190', '12.ABC.345/0001-90'],
    ['CNPJ completo, já com máscara', '12.abc.345/0001-90', '12.ABC.345/0001-90'],
    ['RG de 9 dígitos (SP, sem verificador) — sem máscara', '123456789', '123456789'],
    ['RG de 8 dígitos + letra verificadora — sem máscara', '1234567x', '1234567X'],
    ['RG em digitação (menos de 11 dígitos) — sem máscara', '1234', '1234'],
    ['CPF em digitação (menos de 11 dígitos) — sem máscara', '390533447', '390533447'],
    ['documento com mais de 14 caracteres — sem máscara', '123456789012345', '123456789012345'],
  ]

  it.each(cases)('%s', (_label, input, expected) => {
    expect(maskReceiverDocument(input)).toBe(expected)
  })
})

/**
 * O servidor só aceita CPF ou CNPJ na forma canônica (delivery-proof.schema.ts,
 * `parseReceiverDocument`/`TAX_ID_PATTERN`) — um RG enviado ali quebraria o multipart inteiro,
 * levando a foto/assinatura junto (spec 203: "nunca trava a foto"). `buildReceiverFields` nunca
 * manda ao servidor um documento fora do formato CPF/CNPJ.
 */
describe('o documento só sobe quando é CPF ou CNPJ — nunca o RG (spec 203/207)', () => {
  it('CPF e CNPJ completos sobem canônicos', () => {
    expect(
      buildReceiverFields({
        receivedBy: '',
        receivedByDetail: '',
        receiverDocument: '390.533.447-05',
        receiverName: '',
      }),
    ).toEqual({ receiverDocument: '39053344705' })
    expect(
      buildReceiverFields({
        receivedBy: '',
        receivedByDetail: '',
        receiverDocument: '12.ABC.345/0001-90',
        receiverName: '',
      }),
    ).toEqual({ receiverDocument: '12ABC345000190' })
  })

  it('RG (fora do formato CPF/CNPJ) nunca aparece no que sobe', () => {
    expect(
      buildReceiverFields({
        receivedBy: '',
        receivedByDetail: '',
        receiverDocument: '12.345.678-9',
        receiverName: '',
      }),
    ).toEqual({})
  })
})

/**
 * O botão "Concluir" (spec 207) pede confirmação quando falta algo obrigatório — a lista junta o
 * que falta do comprovante (`listMissingProofFields`) com o que falta de quem recebeu
 * (`listPendingReceiverFields`), nas duas sem duplicar chave.
 */
describe('a lista completa de pendências, para o "Concluir" (spec 207)', () => {
  it('junta o que falta do comprovante com o que falta de quem recebeu', () => {
    const plan = resolveProofFormPlan(
      settings({ receivedBy: 'required', receiverDocument: 'required', receiverName: 'required' }),
    )
    expect(
      listAllPendingFields({
        plan,
        values: {
          hasPhoto: true,
          hasSignature: false,
          receivedBy: '',
          receivedByDetail: '',
          receiverDocument: '',
          receiverName: '',
        },
      }),
    ).toEqual(['receiverName', 'receiverDocument', 'receivedBy'])
  })

  it('nada obrigatório vazio: lista vazia', () => {
    const plan = resolveProofFormPlan(settings())
    expect(
      listAllPendingFields({
        plan,
        values: {
          hasPhoto: false,
          hasSignature: false,
          receivedBy: '',
          receivedByDetail: '',
          receiverDocument: '',
          receiverName: '',
        },
      }),
    ).toEqual([])
  })
})
