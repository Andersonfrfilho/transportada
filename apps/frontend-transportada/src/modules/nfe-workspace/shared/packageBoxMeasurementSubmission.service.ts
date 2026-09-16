/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { BoxDimensionMeasuredResult } from '@/components/ui/boxDimensionProposal.service'

import type { PackageBoxMeasurementInput } from './packageBoxClient.service'
import {
  proposedMillimetres,
  type PackageBoxDimensionKey,
} from './packageBoxMeasurementProposal.service'

export type PackageBoxMeasurementFormSubmission = Omit<PackageBoxMeasurementInput, 'id'>

export type PackageBoxMeasurementSubmissionInput = Readonly<{
  edited: Readonly<Record<PackageBoxDimensionKey, boolean>>
  grossWeightGrams: null | number
  heightMm: number
  impreciseConfirmed: boolean
  lengthMm: number
  /** Ausente: formulário digitado comum (D11). Presente: proposta da câmera (D6, D13, D17). */
  proposal: BoxDimensionMeasuredResult | undefined
  unitsPerBox: number
  widthMm: number
}>

/**
 * O corpo do `PUT` que o formulário da medida monta — extraído do componente (T14, 2ª revisão) para
 * que o **contrato de fronteira** possa pegar exatamente este corpo e passá-lo pelo schema real da
 * API (`test/nfe-workspace/package-box-submission-boundary.contract.ts`, e a outra metade na API).
 *
 * ⚠️ **Editar um campo muda a origem, não a margem enviada.** A margem continua indo junto de
 * `proposed*Mm` (D17) porque ela pertence à proposta da câmera, não ao valor final: sem isso o
 * protocolo de validação (D16, "digite a fita em todos os campos") apagaria a margem de quase toda
 * leitura da sessão real.
 */
export function buildPackageBoxMeasurementSubmission(
  input: PackageBoxMeasurementSubmissionInput,
): PackageBoxMeasurementFormSubmission {
  const measurement = {
    grossWeightGrams: input.grossWeightGrams,
    heightMm: input.heightMm,
    lengthMm: input.lengthMm,
    unitsPerBox: input.unitsPerBox,
    widthMm: input.widthMm,
  }
  const proposal = input.proposal
  if (proposal === undefined) return { ...measurement, source: 'typed' }

  const hasEditedAnyField = input.edited.length || input.edited.width || input.edited.height
  const proposedLength = proposedMillimetres(proposal, 'length')
  const proposedWidth = proposedMillimetres(proposal, 'width')
  const proposedHeight = proposedMillimetres(proposal, 'height')

  return {
    ...measurement,
    camera: {
      engine: proposal.engine,
      heightMarginMm: proposal.heightMarginMm,
      impreciseConfirmed: input.impreciseConfirmed,
      lengthMarginMm: proposal.lengthMarginMm,
      warnings: proposal.warnings,
      widthMarginMm: proposal.widthMarginMm,
      ...(proposedLength === undefined ? {} : { proposedLengthMm: proposedLength }),
      ...(proposedWidth === undefined ? {} : { proposedWidthMm: proposedWidth }),
      ...(proposedHeight === undefined ? {} : { proposedHeightMm: proposedHeight }),
    },
    source: hasEditedAnyField ? 'camera_adjusted' : 'camera',
  }
}
