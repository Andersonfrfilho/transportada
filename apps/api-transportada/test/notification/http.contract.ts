/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  NOTIFICATION_ROUTES_BASE_PATH,
  notificationHttpFixture,
  notificationRequest,
} from '../fixtures/notification-http.fixture'

describe('rotas do módulo de notificações', () => {
  test('inbox responde ao usuário autenticado', async () => {
    const { calls, router } = notificationHttpFixture()

    const response = await router.handle(
      notificationRequest({ pathname: `${NOTIFICATION_ROUTES_BASE_PATH}/notifications` }),
    )

    expect(response.status).toBe(200)
    expect(calls.listNotifications).toHaveLength(1)
  })

  test('preferências e templates estão publicados', async () => {
    const { router } = notificationHttpFixture()

    const preferences = await router.handle(
      notificationRequest({
        pathname: `${NOTIFICATION_ROUTES_BASE_PATH}/notification-preferences`,
      }),
    )
    const templates = await router.handle(
      notificationRequest({ pathname: `${NOTIFICATION_ROUTES_BASE_PATH}/notification-templates` }),
    )

    expect(preferences.status).toBe(200)
    expect(templates.status).toBe(200)
  })

  test('cada empresa lê a própria inbox', async () => {
    const first = notificationHttpFixture({ companyId: FIRST_COMPANY_ID })
    const second = notificationHttpFixture({ companyId: SECOND_COMPANY_ID })

    await first.router.handle(
      notificationRequest({ pathname: `${NOTIFICATION_ROUTES_BASE_PATH}/notifications` }),
    )
    await second.router.handle(
      notificationRequest({ pathname: `${NOTIFICATION_ROUTES_BASE_PATH}/notifications` }),
    )

    expect(first.calls.listNotifications[0]?.companyId).toBe(FIRST_COMPANY_ID)
    expect(second.calls.listNotifications[0]?.companyId).toBe(SECOND_COMPANY_ID)
  })

  test('requisição sem identidade não chega ao caso de uso', async () => {
    const { calls, router } = notificationHttpFixture({ authenticated: false })

    const response = await router.handle(
      notificationRequest({ pathname: `${NOTIFICATION_ROUTES_BASE_PATH}/notifications` }),
    )

    expect(response.status).toBe(401)
    expect(calls.listNotifications).toHaveLength(0)
  })

  test('sem vínculo com a empresa a inbox é negada, não desconhecida', async () => {
    const { calls, router } = notificationHttpFixture({ membership: false })

    const response = await router.handle(
      notificationRequest({ pathname: `${NOTIFICATION_ROUTES_BASE_PATH}/notifications` }),
    )

    expect(response.status).toBe(403)
    expect(calls.listNotifications).toHaveLength(0)
  })

  test('sem segredo configurado o webhook não existe', async () => {
    const { router } = notificationHttpFixture()

    const response = await router.handle(
      notificationRequest({
        method: 'POST',
        pathname: `${NOTIFICATION_ROUTES_BASE_PATH}/notification-webhooks/nota`,
      }),
    )

    expect(response.status).toBe(404)
  })

  test('com segredo configurado o webhook passa a existir', async () => {
    const { router } = notificationHttpFixture({ webhookSecret: 'segredo-de-teste' })

    const response = await router.handle(
      notificationRequest({
        method: 'POST',
        pathname: `${NOTIFICATION_ROUTES_BASE_PATH}/notification-webhooks/nota`,
      }),
    )

    expect(response.status).not.toBe(404)
  })

  test('o caminho do módulo é reconhecido antes do 404 da aplicação', () => {
    const { router } = notificationHttpFixture()

    expect(
      router.match(
        notificationRequest({ pathname: `${NOTIFICATION_ROUTES_BASE_PATH}/notifications` }),
      ),
    ).toBe(true)
    expect(router.match(notificationRequest({ pathname: '/notifications' }))).toBe(false)
  })
})

const FIRST_COMPANY_ID = '00000000-0000-4000-8000-0000000000a1'
const SECOND_COMPANY_ID = '00000000-0000-4000-8000-0000000000a2'
