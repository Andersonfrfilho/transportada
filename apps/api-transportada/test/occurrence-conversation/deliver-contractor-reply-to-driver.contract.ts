/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.6: o operador leva o boleto ao motorista. O aviso no sino sai uma vez, só depois da entrega,
 * e nunca desfaz a entrega; repetir não avisa de novo; ocorrência sem retorno leva o anexo escolhido, e sem
 * anexo escolhido é 404.
 */
import { describe, expect, test } from 'bun:test'

import {
  createDeliverContractorReplyToDriverUseCase,
  type ContractorReplyDeliveryTransactionPort,
} from '../../src/occurrence-conversation/application/deliver-contractor-reply-to-driver.use-case.js'
import type { DeliverContractorReplyToDriverResult } from '../../src/occurrence-conversation/infrastructure/contractor-reply-driver-delivery.support.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OCCURRENCE_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'

const DELIVERED: DeliverContractorReplyToDriverResult = {
  conversationId: 'conversation-1',
  driverMessageId: 'message-1',
  driverUserId: 'driver-1',
  kind: 'delivered',
  occurrenceId: OCCURRENCE_ID,
  protocol: '261012-ABCD',
}

function build(overrides: {
  readonly notifyFails?: boolean
  readonly replyId?: null | string
  readonly result?: DeliverContractorReplyToDriverResult
  readonly typeName?: null | string
}) {
  const notifications: Array<Record<string, unknown>> = []
  const delivered: Array<Record<string, unknown>> = []
  const deliveredAttachments: Array<Record<string, unknown>> = []
  const transaction: ContractorReplyDeliveryTransactionPort = {
    deliver: async (params) => {
      delivered.push({ ...params })
      return overrides.result ?? DELIVERED
    },
    deliverAttachment: async (params) => {
      deliveredAttachments.push({ ...params })
      return overrides.result ?? DELIVERED
    },
    findOccurrenceLabel: async () => 'NF 123',
    findOccurrenceTypeName: async () =>
      overrides.typeName === undefined ? 'Prorrogação do boleto' : overrides.typeName,
    findReplyId: async () => (overrides.replyId === undefined ? 'reply-1' : overrides.replyId),
  }
  const useCase = createDeliverContractorReplyToDriverUseCase({
    clock: () => new Date('2026-10-12T20:00:00.000Z'),
    notifier: {
      notify: async (input) => {
        notifications.push({ ...input })
        if (overrides.notifyFails === true) throw new Error('bell down')
      },
    },
    unitOfWork: { execute: (operation) => operation(transaction) },
  })
  return { delivered, deliveredAttachments, notifications, useCase }
}

const INPUT = { actorUserId: ACTOR_ID, companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID }

describe('entregar o boleto da contratante ao motorista (spec 248 T4.6)', () => {
  test('entrega como operador, avisa o motorista uma vez e devolve a mensagem', async () => {
    const { delivered, notifications, useCase } = build({})
    const outcome = await useCase.deliver(INPUT)
    expect(outcome).toEqual({ conversationMessageId: 'message-1', kind: 'delivered' })
    expect(delivered[0]).toMatchObject({
      actorUserId: ACTOR_ID,
      companyId: COMPANY_ID,
      replyId: 'reply-1',
      trigger: 'operator',
    })
    expect(notifications).toEqual([
      expect.objectContaining({
        dedupeKey: 'message-1',
        occurrenceLabel: 'NF 123',
        protocol: '261012-ABCD',
        recipientUserId: 'driver-1',
        subjectId: OCCURRENCE_ID,
      }),
    ])
  })

  test('falha do sino não desfaz a entrega', async () => {
    const { useCase } = build({ notifyFails: true })
    expect(await useCase.deliver(INPUT)).toEqual({
      conversationMessageId: 'message-1',
      kind: 'delivered',
    })
  })

  test('repetir não avisa de novo, e motorista sem conta volta pulado', async () => {
    const repeated = build({ result: { kind: 'already_delivered' } })
    expect(await repeated.useCase.deliver(INPUT)).toEqual({ kind: 'already_delivered' })
    expect(repeated.notifications).toEqual([])
    const skipped = build({ result: { kind: 'skipped', reason: 'driver_without_account' } })
    expect(await skipped.useCase.deliver(INPUT)).toEqual({
      kind: 'skipped',
      reason: 'driver_without_account',
    })
    expect(skipped.notifications).toEqual([])
  })

  test('ocorrência sem retorno e sem anexo escolhido é 404 e nada é entregue', async () => {
    const { delivered, deliveredAttachments, useCase } = build({ replyId: null })
    await expect(useCase.deliver(INPUT)).rejects.toBeInstanceOf(TripOccurrenceNotFoundError)
    expect(delivered).toEqual([])
    expect(deliveredAttachments).toEqual([])
  })

  test('ocorrência sem retorno leva o anexo escolhido e avisa o motorista', async () => {
    const { delivered, deliveredAttachments, notifications, useCase } = build({ replyId: null })
    const attachmentId = '44444444-4444-4444-8444-444444444444'
    const outcome = await useCase.deliver({ ...INPUT, attachmentId })
    expect(outcome).toEqual({ conversationMessageId: 'message-1', kind: 'delivered' })
    expect(delivered).toEqual([])
    expect(deliveredAttachments).toEqual([
      {
        actorUserId: ACTOR_ID,
        attachmentId,
        bodyText: 'Segue a requisição: Prorrogação do boleto',
        companyId: COMPANY_ID,
        now: new Date('2026-10-12T20:00:00.000Z'),
        occurrenceId: OCCURRENCE_ID,
      },
    ])
    expect(notifications).toHaveLength(1)
  })

  test('o anexo escolhido pelo operador chega ao núcleo da entrega', async () => {
    const { delivered, useCase } = build({})
    await useCase.deliver({ ...INPUT, attachmentId: '44444444-4444-4444-8444-444444444444' })
    expect(delivered[0]).toMatchObject({ attachmentId: '44444444-4444-4444-8444-444444444444' })
  })

  test('sem retorno, o arquivo vai com o texto do tipo; sem tipo, só o arquivo', async () => {
    const attachmentId = '44444444-4444-4444-8444-444444444444'
    const named = build({ replyId: null, typeName: '  Devolução  ' })
    await named.useCase.deliver({ ...INPUT, attachmentId })
    expect(named.deliveredAttachments[0]).toMatchObject({
      bodyText: 'Segue a requisição: Devolução',
    })
    const unnamed = build({ replyId: null, typeName: null })
    await unnamed.useCase.deliver({ ...INPUT, attachmentId })
    expect(unnamed.deliveredAttachments[0]).toMatchObject({ bodyText: '' })
  })
})
