/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T7: "pedir boleto de novo" no grupo — o comando, a escolha da nota entre os pedidos do grupo e a resposta
 * para cada desfecho do reenvio. O roteador do grupo chama este fluxo antes da ocorrência.
 */
import { describe, expect, test } from 'bun:test'

import {
  createGroupBoletoResend,
  GROUP_BOLETO_RESEND_TEXT,
  interpretGroupBoletoResend,
  type GroupBoletoPendingRequest,
  type GroupBoletoResendResult,
} from '../../src/whatsapp/application/whatsapp-group-boleto-resend.service.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type { GroupFlowTurn } from '../../src/whatsapp/application/whatsapp-group-request.port.js'

const TURN: GroupFlowTurn = {
  request: {
    attempts: 0,
    companyId: 'company-1',
    driverId: 'driver-1',
    expiresAt: new Date('2026-11-04T15:00:00Z'),
    groupJid: '120363000000000001@g.us',
    id: 'request-1',
    ownerNumber: '5516991225783',
    state: {},
    step: 'start',
    version: 1n,
  },
  sender: '5516991225783',
  senderName: 'Andrew',
  text: '',
}

function harness(
  pending: readonly GroupBoletoPendingRequest[],
  result: GroupBoletoResendResult = 'sent',
) {
  const resends: { idempotencyKey: string; occurrenceId: string }[] = []
  const flow = createGroupBoletoResend({
    listPending: async () => pending,
    resend: async ({ idempotencyKey, occurrenceId }) => {
      resends.push({ idempotencyKey, occurrenceId })
      return result
    },
  })
  return { flow, resends }
}

describe('spec 292 T7: pedir boleto de novo no grupo', () => {
  test('entende o pedido de repetir o boleto, com ou sem a nota; o resto não é este comando', () => {
    expect(interpretGroupBoletoResend('pedir boleto de novo 0899884')).toEqual({
      documentNumber: '899884',
    })
    expect(interpretGroupBoletoResend('Reenviar o boleto')).toEqual({ documentNumber: null })
    expect(interpretGroupBoletoResend('cobra o boleto da 717795 novamente')).toEqual({
      documentNumber: '717795',
    })
    expect(interpretGroupBoletoResend('prorrogação do boleto 899884')).toBeNull()
    expect(interpretGroupBoletoResend('cheguei de novo')).toBeNull()
  })

  test('uma só aguardando: reenvia ela, pela chave do pedido, e confirma no grupo', async () => {
    const { flow, resends } = harness([{ documentNumber: '899884', occurrenceId: 'occ-1' }])
    expect(await flow.run(TURN, null)).toEqual({
      kind: 'done',
      replies: [GROUP_BOLETO_RESEND_TEXT.sent('899884')],
    })
    expect(resends).toEqual([
      { idempotencyKey: 'whatsapp-group-boleto-resend:request-1', occurrenceId: 'occ-1' },
    ])
  })

  test('várias sem número pede a nota; número que não está no grupo é recusado sem reenviar', async () => {
    const pending = [
      { documentNumber: '899884', occurrenceId: 'occ-1' },
      { documentNumber: '717795', occurrenceId: 'occ-2' },
    ]
    const { flow, resends } = harness(pending)
    expect(await flow.run(TURN, null)).toEqual({
      kind: 'done',
      replies: [GROUP_BOLETO_RESEND_TEXT.askDocument(pending)],
    })
    expect(await flow.run(TURN, '123456')).toEqual({
      kind: 'done',
      replies: [GROUP_BOLETO_RESEND_TEXT.none('123456')],
    })
    expect(await flow.run(TURN, '717795')).toMatchObject({
      replies: [GROUP_BOLETO_RESEND_TEXT.sent('717795')],
    })
    expect(resends.map((resend) => resend.occurrenceId)).toEqual(['occ-2'])
  })

  test('cedo demais ou fora do estado, e falha: a frase de cada um', async () => {
    const pending = [{ documentNumber: '899884', occurrenceId: 'occ-1' }]
    expect(await harness(pending, 'not_resendable').flow.run(TURN, null)).toMatchObject({
      replies: [GROUP_BOLETO_RESEND_TEXT.notResendable('899884')],
    })
    expect(await harness(pending, 'failed').flow.run(TURN, null)).toMatchObject({
      replies: [GROUP_BOLETO_RESEND_TEXT.failed('899884')],
    })
    expect(await harness([]).flow.run(TURN, null)).toMatchObject({
      replies: [GROUP_BOLETO_RESEND_TEXT.none(null)],
    })
  })

  test('o roteador do grupo manda o comando ao reenvio antes da ocorrência', async () => {
    const { flow, resends } = harness([{ documentNumber: '899884', occurrenceId: 'occ-1' }])
    const unexpected = async () => {
      throw new Error('UNEXPECTED_FLOW')
    }
    const router = createGroupDriverFlow({
      boletoResend: flow,
      occurrence: { answer: unexpected, initialStep: 'start', start: unexpected },
      stop: { answer: unexpected, begin: unexpected } as never,
    })
    expect(await router.start({ ...TURN, text: 'pedir boleto de novo 899884' })).toMatchObject({
      kind: 'done',
      replies: [GROUP_BOLETO_RESEND_TEXT.sent('899884')],
    })
    expect(resends).toHaveLength(1)
  })
})

describe('spec 292 T7: o diálogo do pedido fica no estado até ir à conversa', () => {
  test('acrescenta a mensagem do membro e as respostas do bot, com teto de linhas', async () => {
    const { withTranscript, GROUP_REQUEST_TRANSCRIPT_LIMIT } = await import(
      '../../src/whatsapp/application/whatsapp-group-request.service.js'
    )
    const at = new Date('2026-11-04T15:32:00.000Z')
    const first = withTranscript(
      { step: 'x' },
      {},
      {
        at,
        message: { sender: '5516991225783', senderName: 'Andrew', text: '' },
        replies: ['Qual nota?'],
      },
    )
    expect(first).toEqual({
      step: 'x',
      transcript: [
        {
          at: at.toISOString(),
          from: 'member',
          name: 'Andrew',
          number: '5516991225783',
          text: '@bot',
        },
        { at: at.toISOString(), from: 'bot', text: 'Qual nota?' },
      ],
    })
    let state: Readonly<Record<string, unknown>> = first
    for (let index = 0; index < GROUP_REQUEST_TRANSCRIPT_LIMIT; index += 1) {
      state = withTranscript(state, state, {
        at,
        message: { sender: '1', senderName: null, text: 'oi' },
        replies: [],
      })
    }
    expect((state.transcript as unknown[]).length).toBe(GROUP_REQUEST_TRANSCRIPT_LIMIT)
  })
})
