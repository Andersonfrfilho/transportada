/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { fleetDrivers } from '../../database/database.schema.js'
import type {
  ResolveWhatsAppActorParams,
  ResolveWhatsAppActorResult,
} from '../../whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../../trips/domain/trip-permission.constant.js'
import type { WhatsAppSenderRolePorts } from '../application/whatsapp-sender-role.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * O telefone da ficha (DDD + número, 10 ou 11 dígitos) e o número do WhatsApp (com o 55, e às vezes
 * sem o nono dígito, como o WhatsApp guarda os números antigos) são a mesma linha?
 */
export function sameBrazilianPhone(registered: string, whatsapp: string): boolean {
  const local = (value: string) => {
    const digits = value.replace(/\D/gu, '')
    const national = digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits
    // Sem o nono dígito: DDD + 8 dígitos. O celular com o 9 vira a mesma forma.
    return national.length === 11 && national[2] === '9'
      ? `${national.slice(0, 2)}${national.slice(3)}`
      : national
  }
  const left = local(registered)
  return left.length >= 10 && left === local(whatsapp)
}

/** O telefone é de motorista ou ajudante da frota da empresa? */
export async function isCrewPhone(
  database: Database,
  input: { readonly companyId: string; readonly phone: string },
): Promise<boolean> {
  const rows = await database
    .select({ phone: fleetDrivers.phone })
    .from(fleetDrivers)
    .where(eq(fleetDrivers.companyId, input.companyId))
  return rows.some((row) => sameBrazilianPhone(row.phone, input.phone))
}

/**
 * O atendente: telefone verificado de usuário com vínculo ativo (spec 144) e a mesma permissão que a
 * rota da baixa do escritório exige (`trip.report-on-behalf`).
 */
export function createAttendantFinder(dependencies: {
  readonly clock?: () => Date
  readonly resolveActor: (params: ResolveWhatsAppActorParams) => Promise<ResolveWhatsAppActorResult>
}): WhatsAppSenderRolePorts['findAttendant'] {
  const clock = dependencies.clock ?? (() => new Date())
  return async ({ companyId, phone }) => {
    const resolved = await dependencies.resolveActor({ companyId, fromPhone: phone, now: clock() })
    if (resolved.status === 'denied') return null
    const { scope } = resolved.context
    if (scope.kind !== 'company' || !scope.permissions.has(TRIP_REPORT_ON_BEHALF_PERMISSION)) {
      return null
    }
    return { actorUserId: scope.userId }
  }
}
