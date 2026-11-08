/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T3.1 (fluxo 1 de `conversas.html` + RF8): o menu do grupo, o "não entendi" do menu e a opção
 * "Não entreguei", que abre o mesmo fluxo de devolução do comando escrito.
 */
import { describe, expect, test } from 'bun:test'

import type {
  GroupFlowOutcome,
  GroupRequest,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { createGroupDeliveryFlow } from '../../src/whatsapp/application/whatsapp-group-delivery-flow.service.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import { createGroupReturnFlow } from '../../src/whatsapp/application/whatsapp-group-return-flow.service.js'
import { createGroupStopFlow } from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import { formatNotUnderstood } from '../../src/whatsapp-commands/domain/whatsapp-message-format.policy.js'

const MENU_OPTIONS = [
  '*1* - 🚚 Saí para a entrega',
  '*2* - 📍 Cheguei',
  '*3* - ✅ Entreguei',
  '*4* - ↩️ Não entreguei',
  '*5* - ⚠️ Ocorrência',
].join('\n')

const DESIGN_MENU = `*O que você quer lançar?*
${MENU_OPTIONS}

_Responda com o número._`

const DESIGN_NOT_UNDERSTOOD = `🤔 *Não entendi.* Responda com o número da opção:
${MENU_OPTIONS}`

function request(step: string, state: Record<string, unknown> = {}): GroupRequest {
  return {
    attempts: 0,
    companyId: 'C1',
    driverId: 'D1',
    expiresAt: new Date(),
    groupJid: '120363025246125486@g.us',
    id: 'R1',
    ownerNumber: '5516988887777',
    state,
    step,
    version: 1n,
  }
}

function setup(options: { withReturn?: boolean } = {}) {
  const returned: string[] = []
  const flow = createGroupDriverFlow({
    delivery: createGroupDeliveryFlow({
      consumeLocation: () => null,
      findActorUserId: async () => 'U1',
      listOpenDocuments: async () => [],
      preparations: {} as never,
      withoutAccessText: async () => 'sem acesso',
    }),
    occurrence: {
      answer: async () => ({ kind: 'done', replies: ['occ-answer'] }),
      initialStep: 'document',
      start: async () => ({ kind: 'done', replies: ['occ-start'] }),
    },
    ...(options.withReturn === false
      ? {}
      : {
          return: createGroupReturnFlow({
            listOpenDocuments: async () => [{ atArrivedStop: true, id: 'DOC1', number: '017234' }],
            returnDocument: async (input) => {
              returned.push(input.documentNumber)
              return { message: 'devolvida' }
            },
          }),
        }),
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'en-route',
      listStops: async () => [],
      record: async () => ({ message: 'ok' }),
    }),
  })
  let current = request('document')
  let canImportXml = false
  const turn = (text: string) => ({
    ...(canImportXml ? { canImportXml: true } : {}),
    request: current,
    sender: '5516988887777',
    senderName: null,
    text,
  })
  const remember = (outcome: GroupFlowOutcome) => {
    if (outcome.kind === 'continue') current = request(outcome.step, { ...outcome.state })
    return outcome
  }
  return {
    allowXml: () => {
      canImportXml = true
    },
    answer: async (text: string) => remember(await flow.answer(turn(text))),
    returned,
    start: async (text: string) => remember(await flow.start(turn(text))),
  }
}

describe('o menu do grupo (spec 300, fluxo 1)', () => {
  test('@bot sozinho abre o menu do desenho, com "Não entreguei" na 4 e "Ocorrência" na 5', async () => {
    const t = setup()
    expect(await t.start('')).toEqual({
      kind: 'continue',
      replies: [DESIGN_MENU],
      state: {},
      step: 'menu',
    })
  })

  test('texto que não é opção repete só as opções, por baixo do "não entendi"', async () => {
    const t = setup()
    await t.start('')
    const outcome = await t.answer('saida')
    expect(outcome).toMatchObject({ kind: 'not_understood' })
    if (outcome.kind !== 'not_understood') return
    expect(formatNotUnderstood({ reason: outcome.reason })).toBe(
      '🤔 *Não entendi.* Responda com o número da opção:',
    )
    expect(`🤔 *Não entendi.* ${outcome.reason}\n${outcome.prompt}`).toBe(DESIGN_NOT_UNDERSTOOD)
  })

  test('RF8: a opção 4 abre o fluxo de devolução (o mesmo do comando escrito)', async () => {
    const t = setup()
    await t.start('')
    const byMenu = await t.answer('4')
    const typed = await setup().start('não entreguei')
    expect(byMenu).toEqual(typed)
    expect(byMenu).toMatchObject({ kind: 'continue', step: 'return.reason' })
    expect(await t.answer('1')).toMatchObject({ kind: 'done' })
    expect(t.returned).toEqual(['017234'])
  })

  test('sem o fluxo de devolução, "Não entreguei" não aparece e a ocorrência passa a 4', async () => {
    const t = setup({ withReturn: false })
    expect(await t.start('')).toEqual({
      kind: 'continue',
      replies: [
        [
          '*O que você quer lançar?*',
          '*1* - 🚚 Saí para a entrega',
          '*2* - 📍 Cheguei',
          '*3* - ✅ Entreguei',
          '*4* - ⚠️ Ocorrência',
          '',
          '_Responda com o número._',
        ].join('\n'),
      ],
      state: {},
      step: 'menu',
    })
    expect(await t.answer('4')).toEqual({ kind: 'done', replies: ['occ-start'] })
  })

  test('RF8: o nome "não entreguei" também escolhe a opção', async () => {
    const t = setup()
    await t.start('')
    expect(await t.answer('nao entreguei')).toMatchObject({ step: 'return.reason' })
  })

  test('spec 308 D2.4: quem tem envio de XML liberado vê "Enviar XML das notas" na 6; os demais, não', async () => {
    const plain = setup()
    const plainMenu = await plain.start('')
    expect(JSON.stringify(plainMenu)).not.toContain('XML')

    const importer = setup()
    importer.allowXml()
    expect(await importer.start('')).toEqual({
      kind: 'continue',
      replies: [
        DESIGN_MENU.replace('_Responda', '*6* - 📄 Enviar XML das notas\n\n_Responda').replace(
          '\n\n*6*',
          '\n*6*',
        ),
      ],
      state: {},
      step: 'menu',
    })
  })

  test('spec 308 D2.4: a 6 (ou "enviar xml") só orienta e fecha; sem permissão, a 6 não existe', async () => {
    const importer = setup()
    importer.allowXml()
    await importer.start('')
    const byNumber = await importer.answer('6')
    expect(byNumber).toMatchObject({ kind: 'done', withoutFarewell: true })
    expect(JSON.stringify(byNumber)).toContain('XMLs')

    const byName = setup()
    byName.allowXml()
    await byName.start('')
    expect(await byName.answer('enviar xml')).toEqual(byNumber)

    const plain = setup()
    await plain.start('')
    expect(await plain.answer('6')).toMatchObject({ kind: 'not_understood' })
    await plain.start('')
    expect(await plain.answer('xml')).toMatchObject({ kind: 'not_understood' })
  })
})
