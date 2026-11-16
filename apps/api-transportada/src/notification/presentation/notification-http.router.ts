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
  /** Chave pública VAPID para clientes Web Push (PWA do motorista) */
  readonly vapidPublicKey?: string
}

/**
 * O módulo marca estas rotas só como `admin`/`service`, sem escopo exigido, e qualquer membro autenticado entra.
 * Spec 271: a escrita de modelos. Aqui também: o disparo (`POST /notifications`, que manda aviso a qualquer usuário
 * da empresa com o modelo e o payload que o chamador escolher) e a política de canais por categoria.
 * Nenhuma tela usa essas duas — o produto dispara por caso de uso, nunca por HTTP —, então a exigência é a mesma.
 */
const NOTIFICATION_ROOT = NOTIFICATION_ROUTES_BASE_PATH
const WRITE_METHODS: ReadonlySet<string> = new Set(['DELETE', 'PATCH', 'POST', 'PUT'])
const PROTECTED_WRITE_PATHS: readonly { readonly path: string; readonly prefix: boolean }[] = [
  { path: `${NOTIFICATION_ROOT}/notification-templates`, prefix: true },
  { path: `${NOTIFICATION_ROOT}/notification-category-policies`, prefix: true },
  { path: `${NOTIFICATION_ROOT}/notifications`, prefix: false },
]
const TEMPLATE_WRITE_PERMISSION = 'settings.manage'

function isTemplateWrite(request: Request): boolean {
  if (!WRITE_METHODS.has(request.method)) return false
  const { pathname } = new URL(request.url)
  return PROTECTED_WRITE_PATHS.some(({ path, prefix }) =>
    prefix ? pathname === path || pathname.startsWith(`${path}/`) : pathname === path,
  )
}

/**
 * Criar, trocar ou apagar modelo, mudar a política de canais ou disparar notificação por HTTP exige `settings.manage`, antes do roteador do módulo — o texto do
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
  vapidPublicKey,
}: CreateNotificationHttpRouterParams): ModuleFetchRouter {
  const router = createModuleFetchRouter({
    authResolver,
    basePath: NOTIFICATION_ROUTES_BASE_PATH,
    routes: createNotificationRoutes({
      heartbeatSeconds: DEFAULT_SSE_HEARTBEAT_SECONDS,
      module,
      ...(webhookSecret === undefined ? {} : { webhookSecret }),
      ...(vapidPublicKey === undefined ? {} : { vapidPublicKey }),
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
