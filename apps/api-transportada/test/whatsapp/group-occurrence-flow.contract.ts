/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T5 (ampliada em 04/11): o pedido no grupo registra qualquer tipo de ocorrência **ativo** da
 * nota, guiado ou direto, com listas em texto numerado e confirmação antes de registrar.
 */
import { describe, expect, test } from 'bun:test'

import type {
  GroupFlowOutcome,
  GroupRequest,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import {
  createGroupOccurrenceFlow,
  findTypeByName,
  GROUP_DOCUMENT_LIST_LIMIT,
  GROUP_OCCURRENCE_STEP,
  GROUP_OCCURRENCE_TEXT,
  type GroupDriverDocument,
  type GroupOccurrenceFlowPorts,
  type GroupCollectionAnswer,
  type GroupOccurrenceRegistration,
  type GroupOccurrenceType,
} from '../../src/whatsapp/application/whatsapp-group-occurrence-flow.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const PRORROGACAO: GroupOccurrenceType = { id: 'T1', name: 'Prorrogação do boleto' }
const AVARIA: GroupOccurrenceType = { id: 'T2', name: 'Avaria' }
const RECUSA: GroupOccurrenceType = { id: 'T3', name: 'Recusa do cliente' }
const NF1: GroupDriverDocument = { id: 'D1', number: '17234' }
const NF2: GroupDriverDocument = { id: 'D2', number: '000899853' }

function setup(
  options: {
    documents?: readonly GroupDriverDocument[]
    collectionAnswer?: GroupCollectionAnswer | null
    registration?: GroupOccurrenceRegistration
    types?: readonly GroupOccurrenceType[]
    /** Quem abriu é tripulação (motorista/ajudante)? Ausente, a porta não existe. */
    crew?: boolean
  } = {},
) {
  const crewAsked: string[] = []
  const registered: Parameters<GroupOccurrenceFlowPorts['register']>[0][] = []
  const ports: GroupOccurrenceFlowPorts = {
    ...(options.crew === undefined
      ? {}
      : {
          async isCrewMember({ phone }: { readonly companyId: string; readonly phone: string }) {
            crewAsked.push(phone)
            return options.crew === true
          },
        }),
    async answerCollection() {
      return options.collectionAnswer ?? null
    },
    async listDriverDocuments({ driverId }) {
      expect(driverId).toBe(DRIVER_ID)
      return options.documents ?? [NF1, NF2]
    },
    async listOccurrenceTypes() {
      return options.types ?? [PRORROGACAO, AVARIA, RECUSA]
    },
    async register(input) {
      registered.push(input)
      return options.registration ?? { kind: 'registered' }
    },
  }
  const flow = createGroupOccurrenceFlow(ports)
  let request: GroupRequest = {
    attempts: 0,
    companyId: COMPANY_ID,
    driverId: DRIVER_ID,
    expiresAt: new Date(),
    groupJid: '1@g.us',
    id: 'R1',
    ownerNumber: '5516988887777',
    state: {},
    step: flow.initialStep,
    version: 1n,
  }
  const turn = (text: string) => ({ request, sender: '5516988887777', senderName: null, text })
  /** Aplica o resultado como a sessão faria, para o próximo passo. */
  const follow = (outcome: GroupFlowOutcome) => {
    if (outcome.kind === 'continue')
      request = { ...request, state: outcome.state, step: outcome.step }
    return outcome
  }
  return {
    crewAsked,
    answer: async (text: string) => follow(await flow.answer(turn(text))),
    locationReceived: () => flow.locationReceived?.(turn('')) ?? null,
    registered,
    start: async (text: string) => follow(await flow.start(turn(text))),
    step: () => request.step,
  }
}

describe('fluxo do grupo: guiado', () => {
  test('quem abriu e não é motorista nem ajudante não é perguntado pela localização', async () => {
    const office = setup({ crew: false })
    await office.start('')
    await office.answer('2')
    await office.answer('prorrogacao do boleto')
    expect(await office.answer('cliente pediu mais 10 dias')).toMatchObject({
      replies: [
        GROUP_OCCURRENCE_TEXT.confirm(
          'Prorrogação do boleto',
          '000899853',
          'cliente pediu mais 10 dias',
        ),
      ],
      step: GROUP_OCCURRENCE_STEP.confirm,
    })
    expect(office.crewAsked).toEqual(['5516988887777'])

    const crew = setup({ crew: true })
    await crew.start('')
    await crew.answer('2')
    await crew.answer('prorrogacao do boleto')
    expect(await crew.answer('cliente pediu mais 10 dias')).toMatchObject({
      replies: [GROUP_OCCURRENCE_TEXT.askLocation],
      step: GROUP_OCCURRENCE_STEP.location,
    })
  })

  test('nota → tipo → observação → confirmação registra no nome do motorista do grupo', async () => {
    const flow = setup()

    expect(await flow.start('')).toEqual({
      kind: 'continue',
      replies: [GROUP_OCCURRENCE_TEXT.askDocument([NF1, NF2])],
      state: { documents: [NF1, NF2] },
      step: GROUP_OCCURRENCE_STEP.document,
    })
    const types = await flow.answer('2')
    expect(types).toMatchObject({
      replies: [GROUP_OCCURRENCE_TEXT.askType([PRORROGACAO, AVARIA, RECUSA])],
    })
    expect(await flow.answer('prorrogacao do boleto')).toMatchObject({
      replies: [GROUP_OCCURRENCE_TEXT.askNote],
    })
    expect(await flow.answer('cliente pediu mais 10 dias')).toMatchObject({
      replies: [GROUP_OCCURRENCE_TEXT.askLocation],
      step: GROUP_OCCURRENCE_STEP.location,
    })
    expect(await flow.answer('pular')).toMatchObject({
      replies: [
        GROUP_OCCURRENCE_TEXT.confirm(
          'Prorrogação do boleto',
          '000899853',
          'cliente pediu mais 10 dias',
        ),
      ],
    })
    expect(await flow.answer('sim')).toEqual({
      kind: 'done',
      replies: [
        GROUP_OCCURRENCE_TEXT.registered({
          documentNumber: '000899853',
          note: 'cliente pediu mais 10 dias',
          typeName: 'Prorrogação do boleto',
        }),
      ],
    })
    expect(flow.registered).toEqual([
      {
        companyId: COMPANY_ID,
        documentId: 'D2',
        documentNumber: '000899853',
        driverId: DRIVER_ID,
        idempotencyKey: 'whatsapp-group-request:R1',
        note: 'cliente pediu mais 10 dias',
        occurrenceTypeId: 'T1',
      },
    ])
  })

  test('a nota vale pelo número dela, sem zeros à esquerda; o tipo pelo número da opção', async () => {
    const flow = setup()

    await flow.start('')
    await flow.answer('899853')
    await flow.answer('2')
    await flow.answer('pular')
    await flow.answer('pular')
    await flow.answer('1')
    expect(flow.registered[0]).toMatchObject({ documentId: 'D2', note: '', occurrenceTypeId: 'T2' })
  })

  test('responder "não" na confirmação não registra', async () => {
    const flow = setup()

    await flow.start('17234 avaria')
    await flow.answer('pular')
    await flow.answer('pular')
    expect(await flow.answer('2')).toEqual({
      kind: 'done',
      replies: [GROUP_OCCURRENCE_TEXT.declined],
    })
    expect(flow.registered).toEqual([])
  })

  test('com mais notas que a lista comporta, mostra as primeiras e aceita o número da nota', async () => {
    const documents = Array.from({ length: GROUP_DOCUMENT_LIST_LIMIT + 1 }, (_, index) => ({
      id: `D${index}`,
      number: String(1000 + index),
    }))
    const flow = setup({ documents })

    expect(await flow.start('')).toMatchObject({
      replies: [GROUP_OCCURRENCE_TEXT.askDocument(documents)],
    })
    expect(GROUP_OCCURRENCE_TEXT.askDocument(documents)).toContain('E mais 1 nota(s)')
    expect(await flow.answer('1003')).toMatchObject({ kind: 'continue', step: 'type' })
  })
})

describe('fluxo do grupo: direto', () => {
  test('nota e tipo numa mensagem só pulam direto para a observação', async () => {
    const flow = setup()

    expect(await flow.start('prorrogação de boleto 17234 enviar para 16993012323')).toMatchObject({
      replies: [GROUP_OCCURRENCE_TEXT.askNote],
      step: GROUP_OCCURRENCE_STEP.note,
    })
    await flow.answer('pular')
    await flow.answer('pular')
    await flow.answer('1')
    expect(flow.registered[0]).toMatchObject({ documentId: 'D1', occurrenceTypeId: 'T1' })
  })

  test('só a nota no texto pergunta o tipo; motorista com uma nota só nem pergunta a nota', async () => {
    expect(await setup().start('17234')).toMatchObject({ step: GROUP_OCCURRENCE_STEP.type })
    expect(await setup({ documents: [NF1] }).start('')).toMatchObject({
      step: GROUP_OCCURRENCE_STEP.type,
    })
  })
})

describe('fluxo do grupo: pedido falado (áudio)', () => {
  test('o tipo dito antes da nota vale depois que a nota é escolhida', async () => {
    const flow = setup({ documents: [NF1, NF2] })
    expect(await flow.start('eu preciso de uma prorrogação de boleto')).toMatchObject({
      step: GROUP_OCCURRENCE_STEP.document,
    })
    expect(await flow.answer('1')).toMatchObject({
      replies: [GROUP_OCCURRENCE_TEXT.askNote],
      step: GROUP_OCCURRENCE_STEP.note,
    })
    await flow.answer('pular')
    await flow.answer('pular')
    await flow.answer('1')
    expect(flow.registered[0]).toMatchObject({ documentId: 'D1', occurrenceTypeId: 'T1' })
  })

  test('o áudio real das 18:20: nota em duplas e tipo na mesma frase pulam direto para a observação', async () => {
    const flow = setup({ documents: [{ id: 'D9', number: '899877' }, NF1] })
    expect(
      await flow.start('eu preciso de uma prorrogação de boleto da nota 89, 98, 77'),
    ).toMatchObject({ replies: [GROUP_OCCURRENCE_TEXT.askNote], step: GROUP_OCCURRENCE_STEP.note })
    await flow.answer('pular')
    await flow.answer('pular')
    await flow.answer('1')
    expect(flow.registered[0]).toMatchObject({ documentId: 'D9', occurrenceTypeId: 'T1' })
  })

  test('sem tipo no pedido, depois da nota ainda pergunta o tipo', async () => {
    const flow = setup({ documents: [NF1, NF2] })
    await flow.start('')
    expect(await flow.answer('1')).toMatchObject({ step: GROUP_OCCURRENCE_STEP.type })
  })

  test('a nota falada em pedaços ("899, 853") casa no pedido direto e na pergunta da nota', async () => {
    expect(await setup().start('prorrogação do boleto da nota 899, 853')).toMatchObject({
      replies: [GROUP_OCCURRENCE_TEXT.askNote],
      step: GROUP_OCCURRENCE_STEP.note,
    })
    const flow = setup()
    await flow.start('')
    expect(await flow.answer('89, 98, 53.')).toMatchObject({ step: GROUP_OCCURRENCE_STEP.type })
  })
})

describe('fluxo do grupo: localização opcional', () => {
  test('depois da observação o bot pergunta a localização num passo próprio e aceita pular ou enviei', async () => {
    const flow = setup()
    await flow.start('17234 avaria')
    expect(await flow.answer('quebrou')).toMatchObject({
      replies: [GROUP_OCCURRENCE_TEXT.askLocation],
      step: GROUP_OCCURRENCE_STEP.location,
    })
    expect(await flow.answer('talvez')).toMatchObject({ kind: 'not_understood' })
    expect(await flow.answer('enviei')).toMatchObject({ step: GROUP_OCCURRENCE_STEP.confirm })
    expect(GROUP_OCCURRENCE_TEXT.askNote).not.toContain('📍')
  })

  test('a localização compartilhada avança o passo da localização sozinha; fora dele não faz nada', async () => {
    const ports = setup()
    await ports.start('17234 avaria')
    expect(ports.locationReceived()).toBeNull()
    await ports.answer('quebrou')
    expect(ports.locationReceived()).toMatchObject({
      kind: 'continue',
      step: GROUP_OCCURRENCE_STEP.confirm,
    })
  })
})

describe('fluxo do grupo: o que não pode', () => {
  test('tipo fora da lista (desligado não vem na lista) não é aceito', async () => {
    const flow = setup({ types: [PRORROGACAO] })

    await flow.start('17234')
    // mesmo com um tipo só, o bot pergunta o tipo: nada é escolhido sozinho depois da nota
    expect(flow.step()).toBe(GROUP_OCCURRENCE_STEP.type)

    const other = setup({ types: [PRORROGACAO, RECUSA] })
    await other.start('17234 avaria')
    expect(other.step()).toBe(GROUP_OCCURRENCE_STEP.type)
    expect(await other.answer('avaria')).toMatchObject({
      kind: 'not_understood',
      reason: 'não achei esse tipo de ocorrência na lista',
    })
    expect(await other.answer('9')).toMatchObject({ kind: 'not_understood' })
  })

  test('sem nota na viagem ou sem tipo ativo na nota, o pedido termina explicando', async () => {
    expect(await setup({ documents: [] }).start('')).toEqual({
      kind: 'done',
      replies: [GROUP_OCCURRENCE_TEXT.noDocuments],
    })
    expect(await setup({ types: [] }).start('17234')).toEqual({
      kind: 'done',
      replies: [GROUP_OCCURRENCE_TEXT.noTypes],
    })
  })

  test('nota de fora da viagem e confirmação estranha contam como não entendido', async () => {
    const flow = setup()

    await flow.start('')
    expect(await flow.answer('55555')).toMatchObject({
      kind: 'not_understood',
      reason: 'não achei essa nota na viagem do motorista',
    })
    await flow.answer('1')
    await flow.answer('1')
    await flow.answer('pular')
    expect(await flow.answer('talvez')).toMatchObject({ kind: 'not_understood' })
  })

  test('tipo que exige foto termina com a frase do campo; que exige observação volta a pedi-la', async () => {
    const photo = setup({
      registration: { kind: 'refused', message: 'Essa ocorrência exige foto.', retry: null },
    })
    await photo.start('17234 avaria')
    await photo.answer('pular')
    await photo.answer('pular')
    expect(await photo.answer('sim')).toEqual({
      kind: 'done',
      replies: ['Essa ocorrência exige foto.'],
    })

    const note = setup({
      registration: { kind: 'refused', message: 'Digite o que aconteceu.', retry: 'note' },
    })
    await note.start('17234 avaria')
    await note.answer('pular')
    await note.answer('pular')
    expect(await note.answer('sim')).toMatchObject({
      kind: 'continue',
      replies: ['Digite o que aconteceu.'],
      step: GROUP_OCCURRENCE_STEP.note,
    })
  })

  test('tipo recusado pela contratante volta à lista sem ele', async () => {
    const flow = setup({
      registration: { kind: 'refused', message: 'Este tipo não vale.', retry: 'type' },
    })
    await flow.start('17234 avaria')
    await flow.answer('pular')
    await flow.answer('pular')
    expect(await flow.answer('sim')).toMatchObject({
      replies: ['Este tipo não vale.', GROUP_OCCURRENCE_TEXT.askType([PRORROGACAO, RECUSA])],
      step: GROUP_OCCURRENCE_STEP.type,
    })
  })

  test('o nome do tipo casa só sem ambiguidade', () => {
    const types = [PRORROGACAO, AVARIA, RECUSA, { id: 'T4', name: 'Prorrogação da entrega' }]
    expect(findTypeByName(types, 'prorrogação dos boletos')?.id).toBe('T1')
    expect(findTypeByName(types, 'prorrogação')).toBeUndefined()
    expect(findTypeByName(types, 'RECUSA DO CLIENTE')?.id).toBe('T3')
    expect(findTypeByName(types, '')).toBeUndefined()
  })

  test('spec 293 T15: tipo que pede número abre a coleta e o pedido segura a resposta em texto', async () => {
    const flow = setup({
      collectionAnswer: { awaitingText: false, replies: ['Número anotado.', 'Registrada.'] },
      registration: {
        awaitingText: true,
        kind: 'collecting',
        replies: ['Ocorrência da NF 17234: digite "Número do documento do cliente".'],
      },
    })
    await flow.start('17234 avaria')
    await flow.answer('pular')
    await flow.answer('pular')
    expect(await flow.answer('sim')).toEqual({
      kind: 'continue',
      replies: ['Ocorrência da NF 17234: digite "Número do documento do cliente".'],
      state: {},
      step: GROUP_OCCURRENCE_STEP.collect,
    })
    expect(await flow.answer('DEV-123')).toEqual({
      kind: 'done',
      replies: ['Número anotado.', 'Registrada.'],
    })
  })

  test('spec 293 T15: coleta que espera foto fecha o pedido (a foto chega sozinha); texto fora da coleta não é entendido', async () => {
    const photo = setup({
      registration: { awaitingText: false, kind: 'collecting', replies: ['Mande 1 foto.'] },
    })
    await photo.start('17234 avaria')
    await photo.answer('pular')
    await photo.answer('pular')
    expect(await photo.answer('sim')).toEqual({ kind: 'done', replies: ['Mande 1 foto.'] })

    const lost = setup({
      collectionAnswer: null,
      registration: { awaitingText: true, kind: 'collecting', replies: ['Digite o valor.'] },
    })
    await lost.start('17234 avaria')
    await lost.answer('pular')
    await lost.answer('pular')
    await lost.answer('sim')
    expect(await lost.answer('o que?')).toMatchObject({ kind: 'not_understood' })
  })
})

describe('fluxo do grupo: contato do cliente (spec 292 T6)', () => {
  const PEDE_CONTATO: GroupOccurrenceType = {
    contactChannels: ['email', 'whatsapp'],
    id: 'T1',
    name: 'Prorrogação do boleto',
  }
  const turn = (request: Partial<GroupRequest>, text: string) => ({
    request: {
      attempts: 0,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      expiresAt: new Date(),
      groupJid: 'g@g.us',
      id: 'R1',
      ownerNumber: '5516',
      state: {},
      step: 'start',
      version: 1n,
      ...request,
    },
    sender: '5516',
    senderName: null,
    text,
  })
  function build(known: readonly { addressMasked: string; channel: 'email' | 'whatsapp' }[]) {
    const added: { address: string; channel: string }[] = []
    const flow = createGroupOccurrenceFlow({
      async answerCollection() {
        return null
      },
      async addClientContact(input) {
        if (input.address === 'ruim') return { kind: 'refused', reason: 'inválido' }
        added.push({ address: input.address, channel: input.channel })
        return {
          contact: { addressMasked: '(16) *****-0000', channel: input.channel },
          kind: 'added',
        }
      },
      async listClientContacts() {
        return known
      },
      async listDriverDocuments() {
        return [NF1]
      },
      async listOccurrenceTypes() {
        return [PEDE_CONTATO]
      },
      async register() {
        return { kind: 'registered' }
      },
    })
    return { added, flow }
  }

  test('sem contato cadastrado, pede o contato e segue para a observação', async () => {
    const { added, flow } = build([])
    const started = await flow.start(turn({}, 'prorrogação do boleto 17234'))
    expect(started).toMatchObject({ kind: 'continue', step: 'contact' })
    const saved = await flow.answer(
      turn(
        { state: (started as { state: Record<string, unknown> }).state, step: 'contact' },
        '16 99122-5783',
      ),
    )
    expect(saved).toMatchObject({ kind: 'continue', step: 'note' })
    expect(added).toEqual([{ address: '16 99122-5783', channel: 'whatsapp' }])
  })

  test('com contato cadastrado, oferece usar e "1" segue sem digitar', async () => {
    const { added, flow } = build([{ addressMasked: 'c***@x.com', channel: 'email' }])
    const started = await flow.start(turn({}, 'prorrogação do boleto 17234'))
    expect(started).toMatchObject({ kind: 'continue', step: 'contact' })
    const state = (started as { state: Record<string, unknown> }).state
    const next = await flow.answer(turn({ state, step: 'contact' }, '1'))
    expect(next).toMatchObject({ kind: 'continue', step: 'note' })
    expect(added).toEqual([])
  })

  test('"continuar" segue sem contato; texto estranho ou recusado repete a pergunta', async () => {
    const { flow } = build([])
    const started = await flow.start(turn({}, 'prorrogação do boleto 17234'))
    const state = (started as { state: Record<string, unknown> }).state
    expect(await flow.answer(turn({ state, step: 'contact' }, 'continuar'))).toMatchObject({
      kind: 'continue',
      step: 'note',
    })
    expect(await flow.answer(turn({ state, step: 'contact' }, 'blabla'))).toMatchObject({
      kind: 'not_understood',
      prompt: GROUP_OCCURRENCE_TEXT.askContactAgain(false),
      reason: 'preciso de um telefone com DDD ou de um e-mail',
    })
    expect(await flow.answer(turn({ state, step: 'contact' }, 'ruim'))).toMatchObject({
      kind: 'not_understood',
    })
  })
})

describe('fluxo do grupo: resposta de outra pessoa e observação', () => {
  test('observação só com 1 ou 2 números é recusada (resposta de pergunta anterior)', async () => {
    const flow = createGroupOccurrenceFlow({
      async answerCollection() {
        return null
      },
      async listDriverDocuments() {
        return [NF1]
      },
      async listOccurrenceTypes() {
        return [PRORROGACAO]
      },
      async register() {
        return { kind: 'registered' }
      },
    })
    const turn = {
      request: {
        attempts: 0,
        companyId: COMPANY_ID,
        driverId: DRIVER_ID,
        expiresAt: new Date(),
        groupJid: 'g@g.us',
        id: 'R1',
        ownerNumber: '5516',
        state: { documentId: 'D1', documentNumber: '17234', typeId: 'T1', typeName: 'X' },
        step: 'note',
        version: 1n,
      },
      sender: '5516',
      senderName: null,
      text: '1',
    }
    expect(await flow.answer(turn)).toMatchObject({ kind: 'not_understood' })
    const other = await flow.answer({
      ...turn,
      sender: '5599',
      senderName: 'Anderson',
      text: 'cliente pediu',
    })
    expect(other).toMatchObject({ kind: 'continue', step: 'location' })
    expect((other as unknown as { replies: string[] }).replies[0]).toContain('Anderson')
  })
})
