/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { NOTIFICATION_CATALOG } from '../../src/notification/domain/notification-catalog.constant.js'
import { UnknownNotificationTemplateError } from '../../src/notification/domain/notification-template.error.js'
import { createSendTemplateTestUseCase } from '../../src/notification/application/send-template-test.use-case.js'

const CONTEXT = { companyId: 'empresa-1', userId: 'quem-pediu' } as const
const KNOWN_KEY = NOTIFICATION_CATALOG[0]?.templateKey ?? ''

function createFakes() {
  const sends: Record<string, unknown>[] = []
  let counter = 0

  return {
    module: {
      useCases: {
        sendNotification: {
          execute: (input: Record<string, unknown>) => {
            sends.push(input)
            return Promise.resolve({ deduplicated: false, deliveries: [], notificationId: 'n-1' })
          },
        },
      },
    },
    newDedupeKey: () => `chave-${(counter += 1)}`,
    sends,
  }
}

function useCase(fakes: ReturnType<typeof createFakes>) {
  return createSendTemplateTestUseCase(
    fakes as unknown as Parameters<typeof createSendTemplateTestUseCase>[0],
  )
}

/**
 * O teste prova que a mensagem **chega** — o preview já prova que ela renderiza. Por isso ele sai
 * pelo mesmo `sendNotification` das notificações de verdade: um caminho paralelo provaria a entrega
 * de um caminho que a produção não usa.
 */
describe('envio de teste do template', () => {
  test('o catálogo tem chave para testar', () => {
    expect(KNOWN_KEY).not.toBe('')
  })

  /**
   * ⚠️ A regra de segurança inteira: o destino é quem pediu, e a rota não aceita destinatário. Com
   * um campo de destino, a tela de edição viraria um jeito de mandar e-mail com a marca da empresa
   * para qualquer endereço.
   */
  test('o destino é sempre quem pediu', async () => {
    const fakes = createFakes()

    await useCase(fakes).execute({ context: CONTEXT, templateKey: KNOWN_KEY })

    expect(fakes.sends[0]).toMatchObject({
      companyId: CONTEXT.companyId,
      recipientUserId: CONTEXT.userId,
      templateKey: KNOWN_KEY,
    })
  })

  /** Chave repetida faria o módulo devolver a notificação anterior — teste que "passa" sem enviar. */
  test('cada clique tem chave de deduplicação própria', async () => {
    const fakes = createFakes()

    await useCase(fakes).execute({ context: CONTEXT, templateKey: KNOWN_KEY })
    await useCase(fakes).execute({ context: CONTEXT, templateKey: KNOWN_KEY })

    expect(fakes.sends[0]?.dedupeKey).not.toBe(fakes.sends[1]?.dedupeKey)
  })

  /** Sem valores de exemplo, o teste chega com `{{batchName}}` cru na caixa de quem pediu. */
  test('vai com os valores de exemplo do catálogo', async () => {
    const fakes = createFakes()

    await useCase(fakes).execute({ context: CONTEXT, templateKey: KNOWN_KEY })
    const payload = fakes.sends[0]?.payload as Record<string, string>

    expect(Object.keys(payload).length).toBeGreaterThan(0)
  })

  test('a categoria vem do catálogo, não do pedido', async () => {
    const fakes = createFakes()

    await useCase(fakes).execute({ context: CONTEXT, templateKey: KNOWN_KEY })

    expect(fakes.sends[0]?.category).toBe(NOTIFICATION_CATALOG[0]?.category)
  })

  test('chave fora do catálogo é recusada sem enviar nada', async () => {
    const fakes = createFakes()

    await expect(
      useCase(fakes).execute({ context: CONTEXT, templateKey: 'chave.que.nao.existe' }),
    ).rejects.toBeInstanceOf(UnknownNotificationTemplateError)
    expect(fakes.sends).toHaveLength(0)
  })
})
