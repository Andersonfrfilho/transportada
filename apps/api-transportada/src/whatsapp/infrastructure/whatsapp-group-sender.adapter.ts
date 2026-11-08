/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import { fleetDrivers } from '../../database/database.schema.js'
import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
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

const BRAZIL_COUNTRY_CODE = '55'
const MOBILE_NINTH_DIGIT = '9'

/** O número do WhatsApp na forma da ficha (DDD + número) e, para celular, a forma com/sem o nono dígito. */
export function brazilianPhoneCandidates(whatsapp: string): {
  readonly alternate: null | string
  readonly exact: string
} {
  const digits = whatsapp.replace(/\D/gu, '')
  const exact =
    digits.length > 11 && digits.startsWith(BRAZIL_COUNTRY_CODE) ? digits.slice(2) : digits
  if (exact.length === 11 && exact[2] === MOBILE_NINTH_DIGIT) {
    return { alternate: `${exact.slice(0, 2)}${exact.slice(3)}`, exact }
  }
  // Celular antigo sem o nono dígito: o primeiro dígito do número local é 6 a 9.
  if (exact.length === 10 && /^[6-9]$/u.test(exact[2] ?? '')) {
    return { alternate: `${exact.slice(0, 2)}${MOBILE_NINTH_DIGIT}${exact.slice(2)}`, exact }
  }
  return { alternate: null, exact }
}

/**
 * Spec 294 S2: a ficha com o número exato decide; a forma com/sem o nono dígito só vale quando é de uma ficha
 * só — duas fichas no mesmo número alternativo seriam pessoas diferentes e o bot não adivinha.
 */
export function decideCrewPhoneMatch(
  rows: readonly { readonly isCrew: boolean; readonly phone: string }[],
  exact: string,
): boolean {
  const exactRows = rows.filter((row) => row.phone === exact)
  if (exactRows.length > 0) return exactRows.some((row) => row.isCrew)
  const [only, ...others] = rows
  return only !== undefined && others.length === 0 && only.isCrew
}

/**
 * Spec 294 S2: o número é do motorista dono do grupo ou de alguém da tripulação de uma viagem ativa dele? O
 * motorista de outro grupo não é tripulação aqui. A busca é pelo telefone no SQL (a ficha guarda só dígitos),
 * nunca a frota inteira por mensagem.
 */
export async function isCrewPhone(
  database: Database,
  input: { readonly companyId: string; readonly driverId: string; readonly phone: string },
): Promise<boolean> {
  const { alternate, exact } = brazilianPhoneCandidates(input.phone)
  if (exact.length < 10) return false
  const phones = alternate === null ? [exact] : [exact, alternate]
  const terminal = sql.join(
    TRIP_TERMINAL_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  )
  // A coluna vai qualificada à mão: dentro do select de uma tabela só o Drizzle a escreve sem o nome da tabela.
  const rows = await database
    .select({
      isCrew: sql<boolean>`(fleet_drivers.id = ${input.driverId} or exists (
        select 1
          from trip_drivers member
          join trips trip on trip.company_id = member.company_id and trip.id = member.trip_id
          join trip_drivers owner on owner.company_id = member.company_id and owner.trip_id = member.trip_id
         where member.company_id = ${input.companyId}
           and member.driver_id = fleet_drivers.id
           and owner.driver_id = ${input.driverId}
           and trip.status not in (${terminal})
      ))`,
      phone: fleetDrivers.phone,
    })
    .from(fleetDrivers)
    .where(and(eq(fleetDrivers.companyId, input.companyId), inArray(fleetDrivers.phone, phones)))
  return decideCrewPhoneMatch(rows, exact)
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

/**
 * Spec 308 D2.3: qual ficha é deste número? O número exato decide quando é de uma ficha só; sem ele, a forma
 * com/sem o nono dígito só vale quando é de uma ficha só. `fleet_drivers.phone` não é único: duas fichas no
 * mesmo número são pessoas que o bot não sabe separar, e o chat direto fica no painel.
 */
export function decideDriverPhoneMatch(
  rows: readonly { readonly driverId: string; readonly phone: string }[],
  exact: string,
): null | string {
  const exactRows = rows.filter((row) => row.phone === exact)
  const candidates = exactRows.length > 0 ? exactRows : rows
  const [only, ...others] = candidates
  return only !== undefined && others.length === 0 ? only.driverId : null
}

/** Spec 308 D2.3: o motorista **ativo** da empresa com este número de WhatsApp, pelo telefone no SQL. */
export async function findActiveDriverByPhone(
  database: Database,
  input: { readonly companyId: string; readonly phone: string },
): Promise<null | { readonly driverId: string }> {
  const { alternate, exact } = brazilianPhoneCandidates(input.phone)
  if (exact.length < 10) return null
  const phones = alternate === null ? [exact] : [exact, alternate]
  const rows = await database
    .select({ driverId: fleetDrivers.id, phone: fleetDrivers.phone })
    .from(fleetDrivers)
    .where(
      and(
        eq(fleetDrivers.companyId, input.companyId),
        eq(fleetDrivers.status, 'active'),
        inArray(fleetDrivers.phone, phones),
      ),
    )
  const driverId = decideDriverPhoneMatch(rows, exact)
  return driverId === null ? null : { driverId }
}
