/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AuthContextResolverPort } from '@adatechnology/module-http'
import { createModuleFetchRouter, type ModuleFetchRouter } from '@adatechnology/module-http/fetch'
import {
  DEFAULT_SSE_HEARTBEAT_SECONDS,
  createNotificationRoutes,
  type NotificationModule,
} from '@adatechnology/notification-module'

import { NOTIFICATION_ROUTES_BASE_PATH } from '../notification.constant.js'

type CreateNotificationHttpRouterParams = {
  readonly authResolver: AuthContextResolverPort
  readonly module: NotificationModule
  /** Ausente: a rota de webhook não é publicada, e o caminho responde 404 em vez de 401. */
  readonly webhookSecret?: string
}

/** Spec 271: o módulo marca a escrita de modelos só como `admin`, sem escopo exigido, e qualquer membro entra. */
const TEMPLATE_WRITE_PATH = `${NOTIFICATION_ROUTES_BASE_PATH}/notification-templates`
const TEMPLATE_WRITE_METHODS: ReadonlySet<string> = new Set(['DELETE', 'PATCH', 'POST', 'PUT'])
const TEMPLATE_WRITE_PERMISSION = 'settings.manage'

function isTemplateWrite(request: Request): boolean {
  if (!TEMPLATE_WRITE_METHODS.has(request.method)) return false
  const { pathname } = new URL(request.url)
  return pathname === TEMPLATE_WRITE_PATH || pathname.startsWith(`${TEMPLATE_WRITE_PATH}/`)
}

/**
 * Criar, trocar ou apagar modelo de notificação exige `settings.manage`, antes do roteador do módulo — o texto do
 * e-mail à contratante nasce aqui (ADR-0108). Sem identidade resolvida (`undefined`), o módulo responde 401 pelo caminho
 * dele. **Falha de resolução, de qualquer tipo, fecha:** o módulo resolve de novo, e uma oscilação entre as duas leituras não
 * pode deixar passar quem não tem a permissão.
 */
async function isTemplateWriteForbidden(
  authResolver: AuthContextResolverPort,
  request: Request,
): Promise<boolean> {
  try {
    const auth = await authResolver.resolve({ headers: Object.fromEntries(request.headers) })
    return auth !== undefined && !auth.scopes.includes(TEMPLATE_WRITE_PERMISSION)
  } catch {
    return true
  }
}

export function createNotificationHttpRouter({
  authResolver,
  module,
  webhookSecret,
}: CreateNotificationHttpRouterParams): ModuleFetchRouter {
  const router = createModuleFetchRouter({
    authResolver,
    basePath: NOTIFICATION_ROUTES_BASE_PATH,
    routes: createNotificationRoutes({
      heartbeatSeconds: DEFAULT_SSE_HEARTBEAT_SECONDS,
      module,
      ...(webhookSecret === undefined ? {} : { webhookSecret }),
    }),
  })
  return Object.freeze({
    handle: async (request: Request) => {
      if (isTemplateWrite(request) && (await isTemplateWriteForbidden(authResolver, request))) {
        return Response.json(
          { error: { code: 'FORBIDDEN', message: 'Acesso negado.' } },
          { status: 403 },
        )
      }
      return router.handle(request)
    },
    match: (request: Request) => router.match(request),
    routes: router.routes,
  })
}
