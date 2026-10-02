/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 223 RF4/RF9: a nota baixada sem canhoto, exigido pela configuração da empresa.
 *
 * ⚠️ O campo é **opcional**: API anterior à spec 223 não o manda. Ausente é "esta API não conta",
 * nunca "sem pendência" — só `true` marca, e a ausência fica decidida aqui, num lugar só.
 */
export type ProofPendingMarkerSource = Readonly<{ proofPending?: boolean }>

export function hasProofPendingMarker(document: ProofPendingMarkerSource): boolean {
  return document.proofPending === true
}
