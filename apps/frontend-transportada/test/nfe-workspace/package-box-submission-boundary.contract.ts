/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { BoxMargins, BoxMeasurementResult } from '../../src/components/ui/boxDimension.service'
import { buildMeasuredProposal } from '../../src/components/ui/boxDimensionProposal.service'
import {
  buildPackageBoxMeasurementSubmission,
  type PackageBoxMeasurementFormSubmission,
} from '../../src/modules/nfe-workspace/shared/packageBoxMeasurementSubmission.service'

/**
 * ⚠️ **Contrato de fronteira (T14, 2ª revisão de código).** As 10.074 asserções verdes escondiam
 * que nenhuma gravação pela câmera funcionava: o motor devolve `float`, o schema da API exige
 * `int`, e nenhum teste jamais pegou o corpo que a app monta e o passou pelo schema de verdade.
 *
 * Como nenhuma app importa código-fonte de outra, a prova é em duas metades sobre a **mesma**
 * fixture, versionada na raiz:
 *
 * 1. aqui — a app realmente produz exatamente estes corpos, partindo do `float` que o motor emite;
 * 2. em `apps/api-transportada/test/nfe-package-box/measurement-submission-boundary.contract.ts` —
 *    `parsePackageBoxMeasurement` (o schema real da rota) aceita cada um deles.
 *
 * Mexer numa metade sem a outra reprova. Tirar o `Math.round` da proposta reprova esta metade.
 */
const FIXTURE_URL = new URL(
  '../../../../test/fixtures/package-box-measurement-submission.fixture.json',
  import.meta.url,
)

type FixtureCase = Readonly<{ body: PackageBoxMeasurementFormSubmission; name: string }>

const fixture = (await Bun.file(FIXTURE_URL).json()) as Readonly<{ cases: readonly FixtureCase[] }>

function bodyOf(name: string): PackageBoxMeasurementFormSubmission {
  const match = fixture.cases.find((candidate) => candidate.name === name)
  if (match === undefined) throw new Error(`caso ausente na fixture: ${name}`)
  return match.body
}

/** O resto da pose não muda nada nesta prova — o que importa são as seis grandezas da proposta. */
const POSE = {
  focalPx: 900,
  focalSource: 'homography',
  markerSidePx: 120,
  reprojectionErrorPx: 0.4,
  viewAngleDegrees: 18,
} as const

/** O que o motor devolve de verdade: milímetro fracionário, nunca inteiro (`boxDimension.service`). */
function proposalOf(
  nominal: Readonly<{ heightMm: number; lengthMm: number; widthMm: number }>,
  margins: BoxMargins,
  warnings: readonly 'steepAngle'[] = [],
) {
  return buildMeasuredProposal({
    margins,
    nominal: { ...POSE, ...nominal } satisfies BoxMeasurementResult,
    warnings,
  })
}

const FLOAT_NOMINAL = { heightMm: 352.49, lengthMm: 598.7, widthMm: 401.2 }
const FLOAT_MARGINS = { heightMarginMm: 9.5, lengthMarginMm: 6.8, widthMarginMm: 4.2 }
const NOTHING_EDITED = { height: false, length: false, width: false } as const

describe('o corpo que o formulário da câmera envia atravessa o schema da API (spec 152 T14)', () => {
  it('a proposta nasce arredondada: as seis grandezas saem do motor em float e chegam inteiras', () => {
    const proposal = proposalOf(FLOAT_NOMINAL, FLOAT_MARGINS)

    for (const value of [
      proposal.heightMarginMm,
      proposal.heightMm,
      proposal.lengthMarginMm,
      proposal.lengthMm,
      proposal.widthMarginMm,
      proposal.widthMm,
    ]) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })

  it('câmera pura, nenhuma dimensão editada', () => {
    const submission = buildPackageBoxMeasurementSubmission({
      edited: NOTHING_EDITED,
      grossWeightGrams: null,
      heightMm: 352,
      impreciseConfirmed: false,
      lengthMm: 599,
      proposal: proposalOf(FLOAT_NOMINAL, FLOAT_MARGINS),
      unitsPerBox: 1,
      widthMm: 401,
    })

    expect(submission).toEqual(bodyOf('camera pura, nenhuma dimensao editada'))
  })

  /**
   * D6: a câmera não leu a altura (margem acima de 30 mm), o campo nasceu vazio e o conferente
   * digitou 45 cm por cima. `proposedHeightMm` não existe — a câmera nunca propôs valor nenhum.
   */
  it('camera_adjusted com a altura não lida e digitada por cima', () => {
    const submission = buildPackageBoxMeasurementSubmission({
      edited: { height: true, length: false, width: false },
      grossWeightGrams: null,
      heightMm: 450,
      impreciseConfirmed: false,
      lengthMm: 599,
      proposal: proposalOf(FLOAT_NOMINAL, { ...FLOAT_MARGINS, heightMarginMm: 45.3 }),
      unitsPerBox: 1,
      widthMm: 401,
    })

    expect(submission).toEqual(
      bodyOf('camera_adjusted, altura nao lida pela camera e digitada por cima (D6)'),
    )
  })

  it('camera_adjusted com o comprimento corrigido por cima e a altura imprecisa confirmada', () => {
    const submission = buildPackageBoxMeasurementSubmission({
      edited: { height: false, length: true, width: false },
      grossWeightGrams: 12_000,
      heightMm: 352,
      impreciseConfirmed: true,
      lengthMm: 600,
      proposal: proposalOf(FLOAT_NOMINAL, { ...FLOAT_MARGINS, heightMarginMm: 12.6 }, [
        'steepAngle',
      ]),
      unitsPerBox: 2,
      widthMm: 401,
    })

    expect(submission).toEqual(
      bodyOf('camera_adjusted, comprimento corrigido por cima e altura imprecisa confirmada'),
    )
  })
})
