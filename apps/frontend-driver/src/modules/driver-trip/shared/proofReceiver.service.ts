/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverFieldReport } from './driverTrip.types'

type ProofReceiverReport = Extract<DriverFieldReport, { kind: 'proofReceiver' }>

/**
 * Spec 193 D7: monta o relato `proofReceiver` — o PATCH `.../proof/receiver` que carrega quem
 * recebeu chegado depois do anexo (anexo já enviado, ou a comparação da drenagem no `sent`).
 */
export function buildProofReceiverReport(input: {
  readonly documentId: string
  readonly fields: ProofReceiverReport['fields']
  readonly idempotencyKey: string
}): ProofReceiverReport {
  return {
    documentId: input.documentId,
    fields: input.fields,
    idempotencyKey: input.idempotencyKey,
    kind: 'proofReceiver',
  }
}
