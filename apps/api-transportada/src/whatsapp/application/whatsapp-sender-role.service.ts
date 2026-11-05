/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF18: **quem mandou decide a regra.** No grupo do motorista a baixa é da pessoa, não do canal:
 * tripulação (o motorista do grupo ou um ajudante da viagem ativa dele — spec 294 S2: o motorista de outro grupo
 * não é tripulação aqui) segue as regras do motorista; atendente
 * (telefone verificado de usuário com vínculo ativo e a permissão da baixa do escritório) segue as do
 * escritório; qualquer outro número não dá baixa.
 */
export type WhatsAppSenderRole =
  | { readonly kind: 'crew' }
  | { readonly kind: 'attendant'; readonly actorUserId: string }
  | { readonly kind: 'unknown' }

export type WhatsAppSenderRolePorts = {
  /** O usuário que o número identifica **e** que pode dar baixa pelo escritório; `null` caso contrário. */
  readonly findAttendant: (input: {
    readonly companyId: string
    readonly phone: string
  }) => Promise<null | { readonly actorUserId: string }>
  /** O número é do motorista dono do grupo (`driverId`) ou de quem está na viagem ativa dele? */
  readonly isCrewMember: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly phone: string
  }) => Promise<boolean>
}

export type ResolveWhatsAppSenderRole = (input: {
  readonly companyId: string
  /** O motorista dono do grupo: a tripulação é a dele. */
  readonly driverId: string
  readonly phone: string
}) => Promise<WhatsAppSenderRole>

export const SENDER_NOT_ALLOWED_TEXT =
  'Só a tripulação ou um atendente cadastrado registra a entrega.'

/** A tripulação vence quando o mesmo número é das duas coisas: o comportamento de sempre não muda. */
export function createWhatsAppSenderRoleResolver(
  ports: WhatsAppSenderRolePorts,
): ResolveWhatsAppSenderRole {
  return async (input) => {
    if (await ports.isCrewMember(input)) return { kind: 'crew' }
    const attendant = await ports.findAttendant({ companyId: input.companyId, phone: input.phone })
    return attendant === null
      ? { kind: 'unknown' }
      : { actorUserId: attendant.actorUserId, kind: 'attendant' }
  }
}
