/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 160, RF07/RNF03 — CA02 e CA03: duas fontes concordando promovem, uma fonte só propõe.
 */
import { describe, expect, test } from 'bun:test'

import {
  CATALOG_CONSENSUS_TOLERANCE_MM,
  CATALOG_CONSENSUS_WEIGHT_TOLERANCE_RATIO,
  evaluatePackageBoxCatalogConsensus,
  type PackageBoxCatalogSourceProposal,
} from '../../src/nfe-documents/domain/package-box-catalog-consensus.policy.js'

const COSMOS_PROPOSAL: PackageBoxCatalogSourceProposal = {
  grossWeightGrams: 1600,
  heightMm: 240,
  lengthMm: 300,
  provider: 'cosmos',
  widthMm: 200,
}

describe('evaluatePackageBoxCatalogConsensus (spec 160, RF07)', () => {
  test('CA02: duas fontes dentro da tolerância (15 mm / 5%) promovem a medida', () => {
    const gs1Proposal: PackageBoxCatalogSourceProposal = {
      grossWeightGrams: 1610,
      heightMm: 245,
      lengthMm: 305,
      provider: 'gs1',
      widthMm: 195,
    }

    const result = evaluatePackageBoxCatalogConsensus([COSMOS_PROPOSAL, gs1Proposal])

    expect(result.promoted).toBe(true)
    if (!result.promoted) throw new Error('esperava promoção')
    expect(result.agreeingProviders).toEqual(['cosmos', 'gs1'])
    expect(result.marginMm).toBe(5)
  })

  test('CA03: fonte única gera proposta e não promove', () => {
    const result = evaluatePackageBoxCatalogConsensus([COSMOS_PROPOSAL])

    expect(result.promoted).toBe(false)
  })

  test('sem nenhuma fonte, não promove', () => {
    const result = evaluatePackageBoxCatalogConsensus([])

    expect(result.promoted).toBe(false)
  })

  test('duas fontes além da tolerância de aresta (>15 mm) não promovem', () => {
    const divergent: PackageBoxCatalogSourceProposal = {
      grossWeightGrams: 1600,
      heightMm: 240,
      lengthMm: 300 + CATALOG_CONSENSUS_TOLERANCE_MM + 1,
      provider: 'gs1',
      widthMm: 200,
    }

    const result = evaluatePackageBoxCatalogConsensus([COSMOS_PROPOSAL, divergent])

    expect(result.promoted).toBe(false)
  })

  test('duas fontes com arestas iguais mas peso além de 5% não promovem', () => {
    const heavier: PackageBoxCatalogSourceProposal = {
      grossWeightGrams: Math.ceil(
        COSMOS_PROPOSAL.grossWeightGrams * (1 + CATALOG_CONSENSUS_WEIGHT_TOLERANCE_RATIO) + 1,
      ),
      heightMm: 240,
      lengthMm: 300,
      provider: 'gs1',
      widthMm: 200,
    }

    const result = evaluatePackageBoxCatalogConsensus([COSMOS_PROPOSAL, heavier])

    expect(result.promoted).toBe(false)
  })

  test('exatamente na borda da tolerância (15 mm, 5%) ainda promove', () => {
    const atBoundary: PackageBoxCatalogSourceProposal = {
      grossWeightGrams:
        COSMOS_PROPOSAL.grossWeightGrams * (1 + CATALOG_CONSENSUS_WEIGHT_TOLERANCE_RATIO),
      heightMm: COSMOS_PROPOSAL.heightMm + CATALOG_CONSENSUS_TOLERANCE_MM,
      lengthMm: COSMOS_PROPOSAL.lengthMm,
      provider: 'gs1',
      widthMm: COSMOS_PROPOSAL.widthMm,
    }

    const result = evaluatePackageBoxCatalogConsensus([COSMOS_PROPOSAL, atBoundary])

    expect(result.promoted).toBe(true)
  })

  test('três fontes: a primeira dupla que concorda decide a margem promovida', () => {
    const openProductsFacts: PackageBoxCatalogSourceProposal = {
      grossWeightGrams: 1650,
      heightMm: 260,
      lengthMm: 320,
      provider: 'open-products-facts',
      widthMm: 210,
    }
    const gs1Proposal: PackageBoxCatalogSourceProposal = {
      grossWeightGrams: 1605,
      heightMm: 242,
      lengthMm: 302,
      provider: 'gs1',
      widthMm: 198,
    }

    const result = evaluatePackageBoxCatalogConsensus([
      openProductsFacts,
      COSMOS_PROPOSAL,
      gs1Proposal,
    ])

    expect(result.promoted).toBe(true)
    if (!result.promoted) throw new Error('esperava promoção')
    expect(result.agreeingProviders).toEqual(['cosmos', 'gs1'])
  })
})
