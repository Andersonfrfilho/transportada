/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T302 (RF5, D6): a política pura da escrita de um contato da contratante. Os tipos mandam
 * e os dois campos antigos (`receives_occurrences`, `can_decide`) saem derivados deles, porque a 143
 * e a 150 os leem. O aceite do WhatsApp é carimbado pelo servidor — data e autor —, nunca vem do
 * cliente, e é do **número**: trocar o telefone o derruba.
 */
import { describe, expect, test } from 'bun:test'

import {
  EMPTY_CONTRACTOR_CONTACT_STATE,
  resolveContractorContactWrite,
  type ContractorContactState,
  type ContractorContactWriteErrorCode,
} from '../../src/contractor-mail/domain/contractor-contact.policy.js'

const NOW = new Date('2026-09-24T18:00:00.000Z')
const ACTOR = '00000000-0000-4000-8000-0000000000a1'
const EARLIER_ACTOR = '00000000-0000-4000-8000-0000000000a2'
const EARLIER = new Date('2026-09-20T10:00:00.000Z')

const OPTED_IN: ContractorContactState = {
  ...EMPTY_CONTRACTOR_CONTACT_STATE,
  canDecide: true,
  phone: '5511999990001',
  preferredChannel: 'whatsapp',
  receivesOccurrences: true,
  types: ['occurrences', 'approves_charges', 'invoices'],
  whatsappOptInAt: EARLIER,
  whatsappOptInByUserId: EARLIER_ACTOR,
}

function write(
  current: ContractorContactState | null,
  request: Parameters<typeof resolveContractorContactWrite>[0]['request'],
) {
  return resolveContractorContactWrite({ actorUserId: ACTOR, current, now: NOW, request })
}

function expectError(
  result: ReturnType<typeof write>,
  code: ContractorContactWriteErrorCode,
): void {
  expect(result).toEqual({ code, ok: false })
}

describe('tipos → campos antigos (spec 183 T302)', () => {
  test('os campos antigos saem dos tipos, sempre', () => {
    const result = write(null, { types: ['approves_charges', 'scheduling'] })

    expect(result.ok && result.state).toMatchObject({
      canDecide: true,
      receivesOccurrences: false,
      types: ['approves_charges', 'scheduling'],
    })
  })

  test('tipo repetido entra uma vez, na ordem canônica do conjunto', () => {
    const result = write(null, { types: ['invoices', 'occurrences', 'invoices'] })

    expect(result.ok && result.state.types).toEqual(['occurrences', 'invoices'])
  })

  test('pedido antigo, só com os dois campos, mexe só nos dois tipos equivalentes', () => {
    const result = write(OPTED_IN, { receivesOccurrences: false })

    expect(result.ok && result.state).toMatchObject({
      canDecide: true,
      receivesOccurrences: false,
      types: ['approves_charges', 'invoices'],
    })
  })

  test('contato novo pelo pedido antigo mantém os padrões de antes da 183', () => {
    const result = write(null, {})

    expect(result.ok && result.state).toMatchObject({
      canDecide: false,
      receivesOccurrences: true,
      types: ['occurrences'],
    })
  })

  test('tipos e campo antigo no mesmo pedido é conflito — não há quem vença calado', () => {
    expectError(
      write(null, { receivesOccurrences: true, types: ['invoices'] }),
      'CONTRACTOR_CONTACT_TYPES_CONFLICT',
    )
  })

  test('grupos de ocorrência: repetidos saem, ordem canônica; vazio é recusado', () => {
    const result = write(null, { occurrenceStages: ['stop', 'separation', 'stop'] })
    expect(result.ok && result.state.occurrenceStages).toEqual(['separation', 'stop'])

    expectError(write(null, { occurrenceStages: [] }), 'CONTRACTOR_CONTACT_OCCURRENCE_STAGES_EMPTY')
  })
})

describe('telefone e aceite do WhatsApp (spec 183 T302, D6)', () => {
  test('o telefone digitado é normalizado para o formato do WhatsApp; inválido é recusado', () => {
    const result = write(null, { phone: '(11) 99999-0001' })
    expect(result.ok && result.state.phone).toBe('5511999990001')

    expectError(write(null, { phone: '1234' }), 'CONTRACTOR_CONTACT_PHONE_INVALID')
  })

  test('o aceite é carimbado com a hora do servidor e quem clicou', () => {
    const result = write(null, { phone: '11999990001', whatsappOptIn: true })

    expect(result.ok && result.state).toMatchObject({
      whatsappOptInAt: NOW,
      whatsappOptInByUserId: ACTOR,
    })
  })

  test('confirmar de novo o aceite do mesmo número guarda o carimbo original', () => {
    const result = write(OPTED_IN, { phone: '+55 11 99999-0001', whatsappOptIn: true })

    expect(result.ok && result.state).toMatchObject({
      whatsappOptInAt: EARLIER,
      whatsappOptInByUserId: EARLIER_ACTOR,
    })
  })

  test('trocar o número derruba o aceite; o canal WhatsApp então precisa voltar a e-mail', () => {
    expectError(
      write(OPTED_IN, { phone: '11988887777' }),
      'CONTRACTOR_CONTACT_WHATSAPP_WITHOUT_OPT_IN',
    )

    const result = write(OPTED_IN, { phone: '11988887777', preferredChannel: 'email' })
    expect(result.ok && result.state).toMatchObject({
      phone: '5511988887777',
      preferredChannel: 'email',
      whatsappOptInAt: null,
      whatsappOptInByUserId: null,
    })
  })

  test('número novo com aceite no mesmo pedido ganha carimbo novo', () => {
    const result = write(OPTED_IN, { phone: '11988887777', whatsappOptIn: true })

    expect(result.ok && result.state).toMatchObject({
      whatsappOptInAt: NOW,
      whatsappOptInByUserId: ACTOR,
    })
  })

  test('aceite sem telefone é recusado; tirar o telefone tira o aceite', () => {
    expectError(write(null, { whatsappOptIn: true }), 'CONTRACTOR_CONTACT_OPT_IN_WITHOUT_PHONE')

    const cleared = write(OPTED_IN, { phone: null, preferredChannel: 'email' })
    expect(cleared.ok && cleared.state).toMatchObject({
      phone: null,
      whatsappOptInAt: null,
      whatsappOptInByUserId: null,
    })
  })

  test('retirar o aceite apaga o carimbo; WhatsApp preferido sem aceite é recusado', () => {
    const withdrawn = write(OPTED_IN, { preferredChannel: 'email', whatsappOptIn: false })
    expect(withdrawn.ok && withdrawn.state).toMatchObject({
      whatsappOptInAt: null,
      whatsappOptInByUserId: null,
    })

    expectError(
      write(null, { phone: '11999990001', preferredChannel: 'whatsapp' }),
      'CONTRACTOR_CONTACT_WHATSAPP_WITHOUT_OPT_IN',
    )
  })

  test('nome e setor chegam sem espaço nas pontas', () => {
    const result = write(null, { name: '  Compradora Souza ', roleLabel: ' Compras ' })

    expect(result.ok && result.state).toMatchObject({
      name: 'Compradora Souza',
      roleLabel: 'Compras',
    })
  })
})
