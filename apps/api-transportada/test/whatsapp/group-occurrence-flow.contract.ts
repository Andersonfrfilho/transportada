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
    registration?: GroupOccurrenceRegistration
    types?: readonly GroupOccurrenceType[]
  } = {},
) {
  const registered: Parameters<GroupOccurrenceFlowPorts['register']>[0][] = []
  const ports: GroupOccurrenceFlowPorts = {
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
    answer: async (text: string) => follow(await flow.answer(turn(text))),
    registered,
    start: async (text: string) => follow(await flow.start(turn(text))),
    step: () => request.step,
  }
}

describe('fluxo do grupo: guiado', () => {
  test('nota → tipo → observação → confirmação registra no nome do motorista do grupo', async () => {
    const flow = setup()

    expect(await flow.start('')).toEqual({
      kind: 'continue',
      replies: [
        'Qual nota? Responda com o número da opção ou da nota:\n1. NF 17234\n2. NF 000899853',
      ],
      state: { documents: [NF1, NF2] },
      step: GROUP_OCCURRENCE_STEP.document,
    })
    const types = await flow.answer('2')
    expect(types).toMatchObject({
      replies: [
        'Qual ocorrência? Responda com o número ou o nome:\n1. Prorrogação do boleto\n2. Avaria\n3. Recusa do cliente',
      ],
    })
    expect(await flow.answer('prorrogacao do boleto')).toMatchObject({
      replies: [GROUP_OCCURRENCE_TEXT.askNote],
    })
    expect(await flow.answer('cliente pediu mais 10 dias')).toMatchObject({
      replies: [
        'Confirma registrar "Prorrogação do boleto" na NF 000899853?\nObservação: cliente pediu mais 10 dias\nResponda 1 - Sim ou 2 - Não.',
      ],
    })
    expect(await flow.answer('sim')).toEqual({
      kind: 'done',
      replies: ['Ocorrência "Prorrogação do boleto" registrada na NF 000899853.'],
    })
    expect(flow.registered).toEqual([
      {
        companyId: COMPANY_ID,
        documentId: 'D2',
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
    await flow.answer('1')
    expect(flow.registered[0]).toMatchObject({ documentId: 'D2', note: '', occurrenceTypeId: 'T2' })
  })

  test('responder "não" na confirmação não registra', async () => {
    const flow = setup()

    await flow.start('17234 avaria')
    await flow.answer('pular')
    expect(await flow.answer('2')).toEqual({
      kind: 'done',
      replies: [GROUP_OCCURRENCE_TEXT.declined],
    })
    expect(flow.registered).toEqual([])
  })

  test('com mais notas que a lista comporta, pede o número da nota', async () => {
    const documents = Array.from({ length: GROUP_DOCUMENT_LIST_LIMIT + 1 }, (_, index) => ({
      id: `D${index}`,
      number: String(1000 + index),
    }))
    const flow = setup({ documents })

    expect(await flow.start('')).toMatchObject({
      replies: ['Qual nota? Responda com o número da nota.'],
    })
    expect(await flow.answer('3')).toMatchObject({ kind: 'not_understood' })
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

describe('fluxo do grupo: o que não pode', () => {
  test('tipo fora da lista (desligado não vem na lista) não é aceito', async () => {
    const flow = setup({ types: [PRORROGACAO] })

    await flow.start('17234')
    // com um tipo só, ele é escolhido sozinho; num pedido direto com tipo desligado, o nome não casa
    expect(flow.step()).toBe(GROUP_OCCURRENCE_STEP.note)

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
    expect(await photo.answer('sim')).toEqual({
      kind: 'done',
      replies: ['Essa ocorrência exige foto.'],
    })

    const note = setup({
      registration: { kind: 'refused', message: 'Digite o que aconteceu.', retry: 'note' },
    })
    await note.start('17234 avaria')
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
    expect(await flow.answer('sim')).toMatchObject({
      replies: [
        'Este tipo não vale.',
        'Qual ocorrência? Responda com o número ou o nome:\n1. Prorrogação do boleto\n2. Recusa do cliente',
      ],
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
})
