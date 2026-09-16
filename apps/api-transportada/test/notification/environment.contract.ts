/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CryptographicConfigurationError } from '../../src/config/cryptographic-configuration.error'
import { parseEnvironment } from '../../src/config/environment.schema'
import {
  ACTIVE_ENCRYPTION_KEY,
  API_ENVIRONMENT,
  IDEMPOTENCY_HMAC_KEY,
  NOTIFICATION_SUPPRESSION_HMAC_KEY,
} from '../fixtures/cryptographic-environment.fixture'
import {
  createWorkerOwnedEmailDriver,
  WORKER_OWNED_EMAIL_ERROR_CODE,
} from '../../src/notification/infrastructure/worker-owned-email.driver'

describe('contrato do segredo de supressão de notificações', () => {
  test('a chave declarada chega à configuração', () => {
    expect(parseEnvironment(API_ENVIRONMENT).cryptography.notificationSuppressionHmacKey).toBe(
      NOTIFICATION_SUPPRESSION_HMAC_KEY,
    )
  })

  // O HMAC é o que torna o endereço suprimido irreconhecível no banco do módulo. Subir sem ele
  // significaria guardar supressão que não casa com ninguém — e continuar mandando e-mail para
  // quem já recusou. Por isso falha no boot, e não em silêncio no primeiro envio.
  test.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['curta', Buffer.alloc(31, 7).toString('base64')],
    ['sem padding canônico', Buffer.alloc(32, 7).toString('base64').replace(/=$/, '')],
  ])('falha no boot com a chave %s', (_name, value) => {
    expect(() =>
      parseEnvironment({ ...API_ENVIRONMENT, NOTIFICATION_SUPPRESSION_HMAC_KEY: value }),
    ).toThrow(CryptographicConfigurationError)
  })

  // Reuso de material entre propósitos é o mesmo erro que o keyring já recusa: uma chave queimada
  // arrastaria a outra função junto.
  test.each([
    ['do envelope', ACTIVE_ENCRYPTION_KEY],
    ['de idempotência', IDEMPOTENCY_HMAC_KEY],
  ])('recusa reuso da chave %s', (_name, reusedKey) => {
    expect(() =>
      parseEnvironment({ ...API_ENVIRONMENT, NOTIFICATION_SUPPRESSION_HMAC_KEY: reusedKey }),
    ).toThrow(CryptographicConfigurationError)
  })
})

describe('contrato do segredo do webhook de recibo', () => {
  test('o segredo declarado chega à configuração', () => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, NOTIFICATION_WEBHOOK_SECRET: 'segredo-do-provedor' })
        .notificationWebhookSecret,
    ).toBe('segredo-do-provedor')
  })

  // Diferente da chave de supressão, este é opcional: quem ainda não contratou provedor com recibo
  // sobe sem ele — e a rota de webhook simplesmente não existe (404), em vez de aceitar qualquer
  // corpo como recibo.
  test.each([
    ['ausente', undefined],
    ['vazio', ''],
  ])('sobe sem segredo %s', (_name, value) => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, NOTIFICATION_WEBHOOK_SECRET: value })
        .notificationWebhookSecret,
    ).toBeUndefined()
  })
})

describe('contrato da conexão de fila do módulo', () => {
  test('URL e prefixo declarados chegam à configuração', () => {
    const environment = parseEnvironment({
      ...API_ENVIRONMENT,
      QUEUE_PREFIX: 'transportada_local',
      RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
    })

    expect(environment.messaging).toEqual({
      queuePrefix: 'transportada_local',
      url: 'amqp://transportada:transportada@localhost:55672',
    })
  })

  // Sem broker o módulo cai na fila em memória dele — que ninguém consome e que morre no restart.
  // O par é opcional para o ambiente de teste subir sem RabbitMQ, mas é tudo ou nada: metade da
  // configuração viraria uma trilha com nome de outro ambiente.
  test.each([
    ['sem URL', { QUEUE_PREFIX: 'transportada_local', RABBITMQ_URL: undefined }],
    ['sem prefixo', { QUEUE_PREFIX: undefined, RABBITMQ_URL: 'amqp://localhost:55672' }],
    ['sem nenhum', { QUEUE_PREFIX: undefined, RABBITMQ_URL: undefined }],
  ])('fica sem fila %s', (_name, overrides) => {
    expect(parseEnvironment({ ...API_ENVIRONMENT, ...overrides }).messaging).toBeUndefined()
  })
})

/**
 * O e-mail sai só do worker: a API não guarda remetente nem chave de provedor. Ela só decide se o
 * canal é oferecido, e o driver dela recusa enviar — com fila, `send` nunca roda aqui.
 */
describe('contrato do canal de e-mail enfileirado', () => {
  test('desligado por padrão, e a credencial de SMTP não é mais lida aqui', () => {
    const environment = parseEnvironment({
      ...API_ENVIRONMENT,
      EMAIL_FROM: 'no-reply@exemplo.com.br',
      SMTP_URL: 'smtp://localhost:51025',
    })

    expect(environment.emailChannelEnabled).toBe(false)
    expect(JSON.stringify(environment)).not.toContain('smtp://')
  })

  test('ligado, anuncia o canal', () => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, EMAIL_CHANNEL_ENABLED: 'true' }).emailChannelEnabled,
    ).toBe(true)
  })

  test('o driver da API nunca finge que enviou', async () => {
    const outcome = await createWorkerOwnedEmailDriver().send({
      html: '<p>corpo</p>',
      subject: 'assunto',
      text: 'corpo',
      to: 'pessoa@exemplo.com.br',
    })

    expect(outcome).toEqual({ errorCode: WORKER_OWNED_EMAIL_ERROR_CODE, outcome: 'permanent' })
  })
})
