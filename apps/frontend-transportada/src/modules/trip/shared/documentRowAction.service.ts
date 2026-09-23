/* Copyright (c) 2026 Ada Technology. MIT License. */
import { PENDING_CTE_REASONS } from './cteSelection.service'
import type { TripDocumentReadiness } from './trip.types'

export type DocumentRowAction = Readonly<{ kind: 'cte' | 'nfse' }>

export type DocumentRowActionPermissions = Readonly<{
  canIssueNfse: boolean
  canSubmitCte: boolean
}>

/**
 * Spec 175 RF1/RF2/RF7: o botão da linha deixa de ser fixo em "Gerar CT-e" — o documento esperado
 * decide o rótulo, e a permissão é conferida por documento (`cte.submit` para CT-e, `nfse.issue`
 * para NFS-e). Sem `expectedDocument` (campo ausente ou `null`, ou seja `city_unknown`) não há o
 * que decidir: ausência é ausência, nunca "é CT-e".
 */
export function resolveDocumentRowAction(
  entry: TripDocumentReadiness | undefined,
  permissions: DocumentRowActionPermissions,
): DocumentRowAction | null {
  if (entry === undefined || entry.expectedDocument === null) return null

  if (entry.expectedDocument === 'cte') {
    if (!permissions.canSubmitCte) return null
    return (PENDING_CTE_REASONS as readonly string[]).includes(entry.reason)
      ? { kind: 'cte' }
      : null
  }

  if (!permissions.canIssueNfse) return null
  return entry.reason === 'nfse_expected' ? { kind: 'nfse' } : null
}
