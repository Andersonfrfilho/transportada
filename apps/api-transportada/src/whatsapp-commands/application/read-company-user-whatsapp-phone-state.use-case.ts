/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CompanyUserNotFoundError } from '../../identity/domain/company-user.error.js'
import type { MembershipStandingPort } from './whatsapp-actor.port.js'
import type {
  ReadWhatsAppPhoneState,
  ReadWhatsAppPhoneStateInput,
  WhatsAppPhoneState,
} from './read-whatsapp-phone-state.use-case.js'

export type ReadCompanyUserWhatsAppPhoneState = (
  input: ReadWhatsAppPhoneStateInput,
) => Promise<WhatsAppPhoneState>

/** O administrador lê o estado (número mascarado) só de quem tem vínculo com a empresa dele; de fora é 404. */
export function createReadCompanyUserWhatsAppPhoneStateUseCase(dependencies: {
  readonly memberships: MembershipStandingPort
  readonly readState: ReadWhatsAppPhoneState
}): ReadCompanyUserWhatsAppPhoneState {
  return async function readCompanyUserWhatsAppPhoneState(input) {
    const standing = await dependencies.memberships.findStanding(input)
    if (standing === 'absent') throw new CompanyUserNotFoundError()
    return dependencies.readState(input)
  }
}
