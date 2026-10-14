/* Copyright (c) 2026 Ada Technology. MIT License. */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

import {
  PROOF_ORIGINAL_MAX_BYTES,
  PROOF_PHOTO_MAX_BYTES,
  PROOF_UPLOAD_VARIANTS,
} from '@/modules/driver-trip/shared/proofPhotoReduction.service'

const API_POLICY_PATH = resolve(
  import.meta.dir,
  '../../../api-transportada/src/trips/domain/delivery-proof.policy.ts',
)

/**
 * Spec 265 (ADR-0075 §7): os tipos do contrato do comprovante são cópia por valor da API. A leitura é
 * do arquivo-fonte, nunca um import. Enquanto a API da spec 265 não está na base, o arquivo dela não tem
 * as constantes novas e vale o valor da decisão de 14/10 (12 MiB; `reduced`/`original`).
 */
function readApiSource(): string {
  return existsSync(API_POLICY_PATH) ? readFileSync(API_POLICY_PATH, 'utf8') : ''
}

describe('spec 265: paridade com o contrato de comprovante da API', () => {
  it('o teto do original é 12 MiB, igual a PROOF_ORIGINAL_MAX_BYTES da API quando ela o declara', () => {
    expect(PROOF_ORIGINAL_MAX_BYTES).toBe(12 * 1024 * 1024)
    const source = readApiSource()
    if (source.includes('PROOF_ORIGINAL_MAX_BYTES')) {
      expect(source).toMatch(/PROOF_ORIGINAL_MAX_BYTES = 12 \* 1024 \* 1024/u)
    }
  })

  it('o teto da versão reduzida é 960 KiB, igual a OFFICE_PROOF_MAX_BYTES', () => {
    expect(PROOF_PHOTO_MAX_BYTES).toBe(960 * 1024)
    expect(readApiSource()).toMatch(/OFFICE_PROOF_MAX_BYTES = 960 \* 1024/u)
  })

  it('as variantes são as da API, na mesma ordem', () => {
    expect([...PROOF_UPLOAD_VARIANTS]).toEqual(['reduced', 'original'])
    const source = readApiSource()
    const match = /DELIVERY_PROOF_VARIANTS = \[([^\]]*)\] as const/u.exec(source)
    if (match?.[1] !== undefined) {
      expect([...match[1].matchAll(/'([^']+)'/gu)].map((item) => item[1])).toEqual([
        ...PROOF_UPLOAD_VARIANTS,
      ])
    }
  })
})
