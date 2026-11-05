/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { isAcceptableCnhFace } from '../domain/cnh-face-acceptance.policy.js'
import type { CnhFaceExtractionPort, CnhProfilePicturePort } from './cnh-face.port.js'

export const CNH_PICTURE_OUTCOMES = {
  APPLIED: 'applied',
  FAILED: 'failed',
  KEPT_EXISTING: 'kept_existing',
  SKIPPED: 'skipped',
} as const
export type CnhPictureOutcome = (typeof CNH_PICTURE_OUTCOMES)[keyof typeof CNH_PICTURE_OUTCOMES]

export type CnhPictureDependencies = Readonly<{
  extractor: CnhFaceExtractionPort
  /** Só o desfecho e a causa, sem identificador de pessoa nem conteúdo: vira métrica, nunca alerta. */
  onOutcome?: (report: { readonly outcome: CnhPictureOutcome; readonly reason: string }) => void
  picture: CnhProfilePicturePort
}>

/**
 * Melhor esforço: a foto é conveniência, e a leitura dos campos da CNH já foi gravada. Falha daqui não
 * recicla a mensagem (reprocessar não melhora o rosto e re-leria um documento pessoal).
 */
export async function applyCnhProfilePicture(
  input: {
    readonly attachmentId: string
    readonly bytes: Uint8Array
    readonly companyId: string
  },
  dependencies: CnhPictureDependencies,
): Promise<CnhPictureOutcome> {
  const report = (outcome: CnhPictureOutcome, reason: string): CnhPictureOutcome => {
    dependencies.onOutcome?.({ outcome, reason })
    return outcome
  }

  try {
    const result = await dependencies.extractor.extract(input.bytes)
    if (!isAcceptableCnhFace(result)) return report(CNH_PICTURE_OUTCOMES.SKIPPED, result.outcome)

    const { applied } = await dependencies.picture.apply({
      attachmentId: input.attachmentId,
      companyId: input.companyId,
      image: result.webp,
    })
    return applied
      ? report(CNH_PICTURE_OUTCOMES.APPLIED, 'extracted')
      : report(CNH_PICTURE_OUTCOMES.KEPT_EXISTING, 'not_applied')
  } catch (error) {
    /** Só o nome: a mensagem do pdf.js e da API pode citar conteúdo do documento. */
    return report(CNH_PICTURE_OUTCOMES.FAILED, error instanceof Error ? error.name : 'unknown')
  }
}
