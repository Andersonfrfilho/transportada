/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.2: a rota do robô que entrega o lembrete vencido. Permissão própria
 * (`trip.stop-reminder-dispatch`, só no papel `automation`): quem gere viagens (`trip.manage`) não a alcança, e o
 * token do robô não alcança as rotas de gente. `companyId` vem sempre do contexto; o corpo não existe.
 */
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_DRIVER_STOP_REMINDERS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { DeliverDriverStopReminderUseCase } from '../application/deliver-driver-stop-reminder.use-case.js'

const STOP_REMINDER_DISPATCH_POLICY = {
  permission: 'trip.stop-reminder-dispatch',
  scope: 'company',
} as const

export const DRIVER_STOP_REMINDER_DELIVERY_PATH = `${API_DRIVER_STOP_REMINDERS_PATH}/:id/delivery`

type DeliveryRouteInput = { readonly reminderId: string }

export function createDriverStopReminderRoutes(dependencies: {
  readonly deliverDriverStopReminder: DeliverDriverStopReminderUseCase
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<DeliveryRouteInput>({
      handle: async ({ context, input }) => {
        const result = await dependencies.deliverDriverStopReminder.execute({
          companyId: context.scope.companyId,
          reminderId: input.reminderId,
        })
        return new Response(
          JSON.stringify({
            data: { nextDueAt: result.nextDueAt?.toISOString() ?? null, outcome: result.outcome },
          }),
          {
            headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
            status: 200,
          },
        )
      },
      method: 'POST',
      parse: async ({ pathParameters }) => ({
        reminderId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: DRIVER_STOP_REMINDER_DELIVERY_PATH,
      policy: STOP_REMINDER_DISPATCH_POLICY,
    }),
  ]
}
