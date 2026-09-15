/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  NfeStatusProvenance,
  ResolveNfeEventOriginParams,
} from '../types/nfe-document-status.types.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from './system-distribution-actor.constant.js'

/** D14 — quem mandou o arquivo age; quem pediu a busca só solicita; a agenda não é ninguém. */
export function resolveNfeEventOrigin(params: ResolveNfeEventOriginParams): NfeStatusProvenance {
  const { importId, requestedByUserId, source } = params

  if (source === 'upload') {
    return { actorUserId: requestedByUserId, importId, origin: 'manual', requestedByUserId: null }
  }
  if (requestedByUserId === SYSTEM_DISTRIBUTION_ACTOR_USER_ID) {
    return { actorUserId: null, importId, origin: 'automatic', requestedByUserId: null }
  }
  return { actorUserId: null, importId, origin: 'automatic', requestedByUserId }
}
