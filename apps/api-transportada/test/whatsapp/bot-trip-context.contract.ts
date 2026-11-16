/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O bot situa o motorista na viagem antes de pedir a nota, e cumprimenta pelo nome do cadastro.
 */
import { describe, expect, test } from 'bun:test'

import {
  botGreeting,
  botProfileLine,
  registeredFirstName,
} from '../../src/whatsapp/domain/bot-greeting.policy.js'
import { GROUP_DELIVERY_TEXT } from '../../src/whatsapp/application/whatsapp-group-delivery-flow.service.js'
import { GROUP_OCCURRENCE_TEXT } from '../../src/whatsapp/application/whatsapp-group-occurrence-flow.service.js'

const stop = (sequence: number, state: 'arrived' | 'later' | 'next') => ({
  city: 'Ribeirão Preto',
  sequence,
  state,
  totalStops: 3,
})

describe('contexto da viagem antes de pedir a nota', () => {
  const documents = [
    {
      id: 'a',
      number: '100',
      recipientName: 'Padaria Sol',
      stop: stop(1, 'arrived'),
      vehiclePlate: 'ABC1D23',
    },
    {
      id: 'b',
      number: '101',
      recipientName: 'Mercado Lua',
      stop: stop(2, 'next'),
      vehiclePlate: 'ABC1D23',
    },
    {
      id: 'c',
      number: '102',
      recipientName: 'Loja Mar',
      stop: stop(3, 'later'),
      vehiclePlate: 'ABC1D23',
    },
  ]

  test('diz a viagem, a parada em que está e agrupa as notas por parada', () => {
    const text = GROUP_OCCURRENCE_TEXT.askDocument(documents)
    expect(text).toContain('Viagem do *ABC1D23* · 3 notas em aberto em 3 paradas')
    expect(text).toContain('📍 *Parada 1 de 3 · Ribeirão Preto* — você está aqui')
    expect(text).toContain('➡️ *Parada 2 de 3 · Ribeirão Preto* — a próxima')
    expect(text).toContain('*2* · NF `101` · *Mercado Lua*')
  })

  test('sem dado de parada mantém a lista de sempre', () => {
    const text = GROUP_OCCURRENCE_TEXT.askDocument([{ id: 'a', number: '100', recipientName: 'X' }])
    expect(text).toContain('*1* - 🧾 NF `100` · *X*')
    expect(text).not.toContain('Viagem do')
  })
})

describe('saudação pelo nome do cadastro', () => {
  const afternoon = new Date('2026-11-15T18:00:00Z')

  test('usa o primeiro nome do cadastro, não o do perfil do WhatsApp', () => {
    expect(botGreeting(afternoon, registeredFirstName('ANDREIA SILVA'))).toBe(
      'Boa tarde, Andreia! 👋',
    )
  })

  test('só avisa o perfil quando a pessoa tem mais de um', () => {
    expect(botProfileLine({ isDriver: true, isOffice: false })).toBeNull()
    const dual = botProfileLine({ isDriver: true, isOffice: true })
    expect(dual).toContain('*motorista*')
    // O escritório é oferecido no privado (o grupo é da viagem e todos o leem), nunca "use o painel".
    expect(dual).toContain('privado')
    expect(dual).toContain('*menu*')
    expect(dual).not.toContain('painel')
    expect(botProfileLine({ isDriver: false, isOffice: true })).toBeNull()
    // No 1:1 não existe "grupo": a frase não pode citá-lo.
    const direct = botProfileLine({ isDriver: true, isOffice: true }, { isDirect: true })
    expect(direct).toContain('*menu*')
    expect(direct).not.toContain('grupo')
  })
})

describe('contexto da viagem na lista de entrega', () => {
  test('agrupa as notas por parada e diz onde o motorista está', () => {
    const text = GROUP_DELIVERY_TEXT.askDocument([
      {
        id: 'a',
        number: '100',
        recipientName: 'Padaria Sol',
        stop: { city: 'Franca', sequence: 1, state: 'arrived', totalStops: 2 },
        vehiclePlate: 'ABC1D23',
      },
      {
        id: 'b',
        number: '101',
        recipientName: 'Mercado Lua',
        stop: { city: 'Batatais', sequence: 2, state: 'next', totalStops: 2 },
        vehiclePlate: 'ABC1D23',
      },
    ])
    expect(text).toContain('Viagem do *ABC1D23* · 2 notas em aberto em 2 paradas')
    expect(text).toContain('📍 *Parada 1 de 2 · Franca* — você está aqui')
    expect(text).toContain('➡️ *Parada 2 de 2 · Batatais* — a próxima')
  })
})
