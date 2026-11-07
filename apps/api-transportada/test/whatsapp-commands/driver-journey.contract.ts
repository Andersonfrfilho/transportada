/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A jornada do motorista pelo bot (grupo e conversa individual): o bloco da parada, as mensagens de cada passo, o
 * menu das ações do evento repetido e a leitura do pedido tipado. Toda mensagem sai com a marcação do WhatsApp
 * fechada.
 */
import { describe, expect, test } from 'bun:test'

import {
  findStopAwaitingSettlement,
  findStopEnRoute,
  type WhatsAppStopCandidate,
} from '../../src/trips/domain/driver-stop-resolution.policy.js'
import { interpretWhatsAppDriverEventCommand } from '../../src/whatsapp-commands/domain/whatsapp-driver-event-command.policy.js'
import {
  arrivedStopActions,
  describeAlreadyArrived,
  describeAlreadyDeparted,
  describeAlreadySettled,
  describeArrivalReply,
  describeDepartureReply,
  describeNextRouteOffer,
  describePendingSettlement,
  nextRouteActions,
  pickJourneyAction,
  readJourneyActions,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-journey.policy.js'
import {
  DRIVER_PROMPT_CONTEXT_KEY,
  readDriverPrompt,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-prompt.policy.js'
import {
  cityOfStopLabel,
  describeStopEta,
  plainText,
  sumDecimalAmounts,
  type StopCard,
} from '../../src/whatsapp-commands/domain/whatsapp-stop-card.policy.js'
import type { DriverTripStop } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import { createWhatsAppDriverPrompts } from '../../src/whatsapp-commands/application/whatsapp-driver-prompts.service.js'
import { resolveEtaOrigin } from '../../src/whatsapp-commands/infrastructure/whatsapp-stop-card.reader.js'
import { findWhatsAppMarkupProblems } from '../fixtures/whatsapp-markup.fixture.js'

/** 13:05 em Brasília. */
const NOW = new Date('2026-11-06T16:05:00.000Z')

const CARD: StopCard = {
  address: 'RUA DAS FLORES, 100, RIBEIRAO PRETO, SP',
  city: 'RIBEIRAO PRETO',
  contractorName: 'Distribuidora Aurora',
  coordinate: { latitude: '-21.1700000', longitude: '-47.8100000' },
  documentNumbers: ['0017234'],
  isAddressReliable: true,
  recipientName: 'DAIARA DE OLIVEIRA CARDOSO SUPERMERCADO',
  sequence: 2,
  stopId: 'S2',
  totalStops: 5,
  totalValue: '1234.56',
  volumes: 3,
}

const NEXT: StopCard = {
  ...CARD,
  city: 'SERTAOZINHO',
  documentNumbers: ['17300'],
  recipientName: 'Mercado Lua',
  sequence: 3,
  stopId: 'S3',
}

/** O bloco da lista (bairro e cidade) em citação, como o menu e a oferta mostram a parada. */
const LIST_BLOCK = [
  '> *PARADA 2 de 5*',
  '> 🧾 NF `17234` · *DAIARA DE OLIVEIRA CARDOSO SUPERMERCADO*',
  '> 📍 Ribeirao Preto',
  '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81',
].join('\n')

const MENU_QUESTION = '*O que você quer fazer agora?*'

describe('o bloco da parada', () => {
  test('dinheiro é soma de texto decimal em centavos, nunca float', () => {
    expect(sumDecimalAmounts(['0.10', '0.20'])).toBe('0.30')
    expect(sumDecimalAmounts(['1234.5', '10'])).toBe('1244.50')
    expect(sumDecimalAmounts(['', 'abc'])).toBeNull()
  })

  test('a cidade sai do rótulo "RUA, N, CIDADE, UF"; sem UF, nada', () => {
    expect(cityOfStopLabel('RUA DAS FLORES, 100, RIBEIRAO PRETO, SP')).toBe('RIBEIRAO PRETO')
    expect(cityOfStopLabel('Centro, 100')).toBe('')
  })

  test('dado de terceiro perde os marcadores do WhatsApp', () => {
    expect(plainText('*Padaria*  _Sol_ ~x~')).toBe('Padaria Sol x')
  })

  test('a estrada: distância com vírgula e chegada prevista em Brasília', () => {
    expect(describeStopEta({ distanceMetres: 12_340, durationSeconds: 1500 }, NOW)).toBe(
      '📏 *12,3 km* do seu último ponto · ⏱️ _chegada prevista ~13:30 (25 min)_',
    )
  })

  test('a saída: frase, bloco em citação, valor, chegada prevista e próximo passo', () => {
    expect(
      describeDepartureReply(
        '🚚 *Saída registrada* · 13:05',
        { card: CARD, eta: { distanceMetres: 12_340, durationSeconds: 1500 } },
        NOW,
      ),
    ).toBe(
      [
        '🚚 *Saída registrada* · 13:05',
        '',
        '> *PARADA 2 de 5*',
        '> 🧾 NF `17234` · *DAIARA DE OLIVEIRA CARDOSO SUPERMERCADO*',
        '> 🏢 Contratante: Distribuidora Aurora',
        '> 📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP',
        '> 📦 3 volumes',
        '> 📏 *12 km* · ⏱️ _~25 min_',
        '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81',
        '> 💰 Valor da nota: *R$ 1.234,56*',
        '> ⏱️ Chegada prevista: *~13:30*',
        '',
        '➡️ _Próximo passo:_ quando chegar, mande *cheguei*.',
      ].join('\n'),
    )
  })

  test('sem ponto compartilhado não há estrada; endereço sem localização certa avisa depois do bloco', () => {
    const text = describeDepartureReply(
      '🚚 *Saída registrada* · 13:05',
      { card: { ...CARD, isAddressReliable: false } },
      NOW,
    )
    expect(text).not.toContain('km')
    expect(text).not.toContain('Chegada prevista')
    expect(text).toContain(
      '> 💰 Valor da nota: *R$ 1.234,56*\n\n⚠️ _Este endereço está sem localização certa no mapa. Quando chegar, mande cheguei e compartilhe a localização: eu atualizo o endereço._\n\n➡️',
    )
  })

  test('a chegada: a frase, o bloco em citação com o valor, a prévia da próxima (sem pergunta) e o próximo passo', () => {
    expect(
      describeArrivalReply('📍 *Chegada registrada* · 13:05', { card: CARD, next: NEXT }),
    ).toBe(
      [
        '📍 *Chegada registrada* · 13:05',
        '',
        '> *PARADA 2 de 5*',
        '> 🧾 NF `17234` · *DAIARA DE OLIVEIRA CARDOSO SUPERMERCADO*',
        '> 🏢 Contratante: Distribuidora Aurora',
        '> 📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP',
        '> 📦 3 volumes',
        '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81',
        '> 💰 Valor da nota: *R$ 1.234,56*',
        '',
        '🔜 *Depois desta:* parada 3 · Mercado Lua – Sertaozinho',
        '',
        '➡️ _Próximo passo:_ depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.',
      ].join('\n'),
    )
  })
})

describe('o evento repetido oferece o que cabe no estado da parada', () => {
  test('"cheguei" repetido: já registrada às HH:MM, o bloco e as quatro ações da parada que chegou', () => {
    expect(
      describeAlreadyArrived({ card: CARD }, { arrivedAt: '2026-11-06T03:28:00.000Z', now: NOW }),
    ).toBe(
      [
        '⚠️ *A chegada na parada 2 já foi registrada* às 00:28.',
        '',
        LIST_BLOCK,
        '',
        MENU_QUESTION,
        '*1* - ✅ Entreguei _(mande a foto do canhoto)_',
        '*2* - ↩️ Não entreguei',
        '*3* - ⚠️ Abrir ocorrência',
        '*4* - 💤 Nada por enquanto',
      ].join('\n'),
    )
  })

  test('"saí" repetido (RF9): a frase do `fala_stop_en_route`, o bloco com a estrada e o menu Cheguei, ocorrência, nada', () => {
    expect(
      describeAlreadyDeparted(
        { card: CARD, eta: { distanceMetres: 3200, durationSeconds: 480 } },
        '⚠️ *Você já está a caminho da parada 2.*\nRegistre a chegada nela antes de sair para outra.',
      ),
    ).toBe(
      [
        '⚠️ *Você já está a caminho da parada 2.*',
        'Registre a chegada nela antes de sair para outra.',
        '',
        '> *PARADA 2 de 5*',
        '> 🧾 NF `17234` · *DAIARA DE OLIVEIRA CARDOSO SUPERMERCADO*',
        '> 📍 Ribeirao Preto',
        '> 📏 *3,2 km* · ⏱️ _~8 min_',
        '> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81',
        '',
        MENU_QUESTION,
        '*1* - 📍 Cheguei na *parada 2*',
        '*2* - ⚠️ Abrir ocorrência',
        '*3* - 💤 Nada por enquanto',
      ].join('\n'),
    )
  })

  test('"saí" com a baixa pendente avisa e deixa sair sem a baixa (nunca recusa)', () => {
    expect(
      describePendingSettlement(
        { card: CARD },
        { arrivedAt: '2026-11-06T15:00:00.000Z', now: NOW },
      ),
    ).toBe(
      [
        '⚠️ *Falta a baixa da parada 2.*',
        'Você chegou às 12:00 e ainda não registrou a entrega.',
        '',
        LIST_BLOCK,
        '',
        MENU_QUESTION,
        '*1* - ✅ Entreguei _(mande a foto do canhoto)_',
        '*2* - ↩️ Não entreguei',
        '*3* - 🚚 Sair para outra parada sem dar a baixa',
        '*4* - 💤 Nada por enquanto',
      ].join('\n'),
    )
  })

  test('"entreguei" numa nota já baixada diz quando', () => {
    expect(
      describeAlreadySettled({
        documentNumber: '017234',
        now: NOW,
        returned: false,
        settledAt: '2026-11-06T15:00:00.000Z',
      }),
    ).toBe('⚠️ *A entrega da NF `17234` já foi registrada* às 12:00.\nNada foi gravado de novo.')
  })

  test('a oferta da próxima rota: seguir para ela, escolher outra ou nada', () => {
    expect(describeNextRouteOffer({ card: NEXT }, { asks: true })).toEndWith(
      '*1* - 🚚 Seguir para a *parada 3*\n*2* - 📋 Escolher outra da lista\n*3* - 💤 Nada por enquanto',
    )
  })

  test.each([
    describeAlreadyArrived({ card: CARD }, { arrivedAt: 'x', now: NOW }),
    describeNextRouteOffer({ card: NEXT }, { asks: false }),
    describePendingSettlement(
      { card: { ...CARD, recipientName: '*' } },
      { arrivedAt: '', now: NOW },
    ),
  ])('a marcação do WhatsApp fica fechada', (text) => {
    expect(findWhatsAppMarkupProblems(text)).toEqual([])
  })

  test('hora que não é data some, em vez de "às NaN"', () => {
    expect(
      describeAlreadyArrived({ card: CARD }, { arrivedAt: 'x', now: NOW }).split('\n')[0],
    ).toBe('⚠️ *A chegada na parada 2 já foi registrada*.')
  })
})

describe('a escolha no menu (texto ou áudio)', () => {
  const actions = arrivedStopActions(CARD)

  test.each([
    ['1', 'deliver'],
    ['opção dois', 'return'],
    ['três', 'occurrence'],
    ['4', 'none'],
    ['não entreguei', 'return'],
    ['entreguei', 'deliver'],
    ['nada', 'none'],
  ])('"%s" escolhe %s', (text, kind) => {
    expect(pickJourneyAction(actions, text)?.kind).toBe(kind as never)
  })

  test.each(['9', 'talvez', ''])('"%s" não escolhe nada', (text) => {
    expect(pickJourneyAction(actions, text)).toBeUndefined()
  })

  test('"sim" segue para a próxima parada na oferta', () => {
    expect(pickJourneyAction(nextRouteActions(NEXT), 'sim')?.kind).toBe('depart')
  })

  test('o estado guardado é conferido: só ids e números de nota, o resto cai', () => {
    expect(
      readJourneyActions([
        { documentNumber: '1', kind: 'deliver' },
        { kind: 'depart', sequence: 4, stopId: 'S1' },
        { kind: 'none' },
        { kind: 'depart' },
        { kind: 'bogus' },
        'x',
      ]),
    ).toEqual([
      { documentNumber: '1', kind: 'deliver' },
      { kind: 'depart', sequence: 4, stopId: 'S1' },
      { kind: 'none' },
    ])
  })

  test('o pedido tipado da conversa individual lê o menu e a lista de saída', () => {
    const offeredAt = NOW.toISOString()
    expect(
      readDriverPrompt(
        {
          [DRIVER_PROMPT_CONTEXT_KEY]: {
            actions: [{ kind: 'none' }],
            kind: 'journey_actions',
            offeredAt,
            stopId: 'S1',
          },
        },
        NOW,
      ),
    ).toMatchObject({ actions: [{ kind: 'none' }], kind: 'journey_actions' })
    expect(
      readDriverPrompt(
        {
          [DRIVER_PROMPT_CONTEXT_KEY]: {
            confirmOutOfOrder: true,
            kind: 'stop_choice',
            offeredAt,
            stopId: 'S1',
            stops: [{ id: 'S1', numbers: ['17234'] }],
          },
        },
        NOW,
      ),
    ).toMatchObject({ confirmOutOfOrder: true, kind: 'stop_choice' })
    expect(
      readDriverPrompt(
        {
          [DRIVER_PROMPT_CONTEXT_KEY]: {
            actions: [],
            kind: 'journey_actions',
            offeredAt,
            stopId: 'S1',
          },
        },
        NOW,
      ),
    ).toBeUndefined()
  })
})

describe('as paradas da jornada', () => {
  const base: WhatsAppStopCandidate = {
    arrivedAt: null,
    completedAt: null,
    documents: [{ number: '1', separationStatus: 'loaded' }],
    enRouteSince: null,
    id: 'S1',
    sequence: 1,
  }

  test('parada que chegou e falta a baixa é a que espera a baixa; a fechada não', () => {
    const arrived = { ...base, arrivedAt: '2026-11-06T15:00:00.000Z' }
    expect(findStopAwaitingSettlement([arrived])?.id).toBe('S1')
    expect(
      findStopAwaitingSettlement([
        { ...arrived, documents: [{ number: '1', separationStatus: 'delivered' }] },
      ]),
    ).toBeUndefined()
  })

  test('parada a caminho', () => {
    expect(findStopEnRoute([{ ...base, enRouteSince: '2026-11-06T15:00:00.000Z' }])?.id).toBe('S1')
    expect(findStopEnRoute([base])).toBeUndefined()
  })

  test.each([
    ['não entreguei', { kind: 'return', numbers: [] }],
    ['nao entreguei 17234', { kind: 'return', numbers: ['17234'] }],
    [
      'Não entreguei 17234, recusou',
      { kind: 'return', numbers: ['17234'], reason: 'recipient_refused' },
    ],
  ])('"%s" é a baixa de não entrega', (text, expected) => {
    expect(interpretWhatsAppDriverEventCommand(text)).toEqual(expected as never)
  })
})

describe('o bloco da parada é melhor esforço na conversa individual (revisão do #552)', () => {
  test('o leitor falhando não derruba a resposta: o registro responde a frase de sempre', async () => {
    const prompts = createWhatsAppDriverPrompts({
      clock: () => NOW,
      ports: {
        reportArrival: async () => ({}),
        reportDeparture: async () => ({ changed: true }),
      },
      speech: CATALOG_BOT_SPEECH,
      stopCards: { read: () => Promise.reject(new Error('banco fora')) },
    })
    const result = await prompts.recordStop({
      actor: { actorUserId: 'U', companyId: 'C', driverId: 'D' },
      context: {},
      event: 'depart',
      idempotencyKey: 'k',
      location: null,
      stopId: 'S1',
    })
    expect(result.texts).toEqual(['🚚 *Saída registrada* · 13:05'])
  })
})

describe('a estrada só a partir do ponto do trecho atual (revisão do #552)', () => {
  const trip = (stops: readonly Partial<DriverTripStop>[]) =>
    ({
      stops: stops.map((item) => ({ arrivedAt: null, enRouteSince: null, id: '', ...item })),
    }) as never

  test('saída: o ponto vale só da saída desta parada', () => {
    expect(
      resolveEtaOrigin(trip([{ enRouteSince: '2026-11-06T15:00:00.000Z', id: 'S2' }]), 'S2'),
    ).toEqual({ kinds: ['departed'], stopId: 'S2' })
  })

  test('oferta: o ponto vale só da última parada em que o motorista chegou', () => {
    expect(
      resolveEtaOrigin(
        trip([
          { arrivedAt: '2026-11-06T09:00:00.000Z', id: 'S1' },
          { arrivedAt: '2026-11-06T14:00:00.000Z', id: 'S2' },
          { id: 'S3' },
        ]),
        'S3',
      ),
    ).toEqual({ kinds: ['arrived', 'delivered', 'returned'], stopId: 'S2' })
  })

  test('sem saída nem chegada na viagem, não há trecho (sem estrada)', () => {
    expect(resolveEtaOrigin(trip([{ id: 'S1' }]), 'S1')).toBeNull()
  })
})
