/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHmac } from 'node:crypto'

import type { CachePort } from '@adatechnology/notification-contracts'
import type { NotificationModule } from '@adatechnology/notification-module'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { NOTIFICATION_ROUTES_BASE_PATH } from '../../src/notification/notification.constant'
import { createNotificationAuthResolver } from '../../src/notification/presentation/notification-auth.resolver'
import { createNotificationHttpRouter } from '../../src/notification/presentation/notification-http.router'
import { ApiError } from '../../src/shared/api.error'

export { NOTIFICATION_ROUTES_BASE_PATH }

export const NOTIFICATION_COMPANY_ID = '00000000-0000-4000-8000-000000000101'
export const NOTIFICATION_USER_ID = '00000000-0000-4000-8000-000000000102'

type ListNotificationsCall = {
  readonly companyId: string
  readonly recipientUserId: string
}

type DeliveryReceiptCall = {
  readonly channel: string
}

type NotificationCalls = {
  listNotifications: ListNotificationsCall[]
  receiveDeliveryReceipt: DeliveryReceiptCall[]
}

type NotificationHttpFixtureParams = {
  readonly authenticated?: boolean
  readonly cache?: CachePort
  readonly companyId?: string
  readonly membership?: boolean
  readonly now?: Date
  readonly webhookSecret?: string
}

export function notificationHttpFixture({
  authenticated = true,
  cache,
  companyId = NOTIFICATION_COMPANY_ID,
  membership = true,
  now,
  webhookSecret,
}: NotificationHttpFixtureParams = {}) {
  const calls: NotificationCalls = { listNotifications: [], receiveDeliveryReceipt: [] }

  const router = createNotificationHttpRouter({
    authResolver: createNotificationAuthResolver({
      authentication: {
        async authenticate() {
          if (!authenticated) {
            throw new ApiError({
              code: 'UNAUTHENTICATED',
              message: 'Authentication required',
              status: 401,
            })
          }
          return identity(companyId)
        },
      },
      tenantContext: {
        async resolveCompany() {
          if (!membership) {
            throw new ApiError({ code: 'FORBIDDEN', message: 'Access denied', status: 403 })
          }
          return companyContext(companyId)
        },
      },
    }),
    module: stubModule({
      calls,
      ...(cache === undefined ? {} : { cache }),
      ...(now === undefined ? {} : { now }),
    }),
    ...(webhookSecret === undefined ? {} : { webhookSecret }),
  })

  return { calls, router }
}

type NotificationRequestParams = {
  readonly method?: string
  readonly pathname: string
}

export function notificationRequest({
  method = 'GET',
  pathname,
}: NotificationRequestParams): Request {
  return new Request(`http://localhost${pathname}`, {
    headers: { authorization: 'Bearer header.payload.signature' },
    method,
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }),
  })
}

type StubModuleParams = {
  readonly cache?: CachePort
  readonly calls: NotificationCalls
  readonly now?: Date
}

export const NOTIFICATION_WEBHOOK_PATH = `${NOTIFICATION_ROUTES_BASE_PATH}/notification-webhooks/smtp`

type NotificationWebhookRequestParams = {
  readonly body?: string
  readonly secret: string
  readonly signature?: string
  readonly timestampSeconds: number
}

/**
 * A assinatura é HMAC-SHA256 sobre o timestamp **e** o corpo cru, nessa ordem: reproduzi-la aqui é
 * o que permite ao contrato assinar certo e depois assinar errado de propósito.
 */
export function notificationWebhookRequest({
  body = JSON.stringify({
    occurredAt: '2026-08-13T12:00:00.000Z',
    providerMessageId: 'provider-message-1',
    status: 'delivered',
  }),
  secret,
  signature,
  timestampSeconds,
}: NotificationWebhookRequestParams): Request {
  const timestampHeader = String(timestampSeconds)
  const digest = createHmac('sha256', secret).update(timestampHeader).update(body).digest('hex')
  return new Request(`http://localhost${NOTIFICATION_WEBHOOK_PATH}`, {
    body,
    headers: {
      'content-type': 'application/json',
      'x-notification-signature': signature ?? `sha256=${digest}`,
      'x-notification-timestamp': timestampHeader,
    },
    method: 'POST',
  })
}

function stubModule({ cache, calls, now }: StubModuleParams): NotificationModule {
  const useCases = {
    getPreferences: {
      async execute() {
        return { channels: {} }
      },
    },
    listNotifications: {
      async execute(params: ListNotificationsCall) {
        calls.listNotifications.push(params)
        return { data: [], nextCursor: undefined }
      },
    },
    listTemplates: {
      async execute() {
        return []
      },
    },
    receiveDeliveryReceipt: {
      async execute(params: DeliveryReceiptCall) {
        calls.receiveDeliveryReceipt.push(params)
        return undefined
      },
    },
  }
  return {
    useCases,
    ...(cache === undefined ? {} : { cache }),
    ...(now === undefined ? {} : { clock: { now: () => now } }),
  } as unknown as NotificationModule
}

function companyContext(companyId: string): AuthenticatedContext<CompanyContext> {
  return Object.freeze({
    identity: identity(companyId),
    scope: Object.freeze({
      companyId,
      kind: 'company' as const,
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(['settings.manage'] as const),
      roles: ['company-admin'] as const,
      userId: NOTIFICATION_USER_ID,
    }),
  })
}

function identity(companyId: string): AuthenticatedIdentity {
  return Object.freeze({
    companyIdClaim: companyId,
    externalIdentityId: '00000000-0000-4000-8000-000000000104',
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    subject: 'notification-contract-user',
    userId: NOTIFICATION_USER_ID,
  })
}
