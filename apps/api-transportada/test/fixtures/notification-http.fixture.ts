/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
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

type NotificationHttpFixtureParams = {
  readonly authenticated?: boolean
  readonly companyId?: string
  readonly membership?: boolean
  readonly webhookSecret?: string
}

export function notificationHttpFixture({
  authenticated = true,
  companyId = NOTIFICATION_COMPANY_ID,
  membership = true,
  webhookSecret,
}: NotificationHttpFixtureParams = {}) {
  const calls: { listNotifications: ListNotificationsCall[] } = { listNotifications: [] }

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
    module: stubModule(calls),
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

function stubModule(calls: { listNotifications: ListNotificationsCall[] }): NotificationModule {
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
      async execute() {
        return undefined
      },
    },
  }
  return { useCases } as unknown as NotificationModule
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
