/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Spec 249: a trilha de `audit_logs` da transferência — no molde de `office.trip.close`. */
export const TRIP_CREW_TRANSFER_AUDIT_ACTION = 'office.trip.crew-transfer'

/** O alvo da auditoria é a própria viagem, não um motorista: transferir não é "em nome de" ninguém. */
export const TRIP_AUDIT_ENTITY_TYPE = 'trip'
