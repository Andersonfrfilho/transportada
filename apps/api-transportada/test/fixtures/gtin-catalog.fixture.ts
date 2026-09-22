/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 160 (P3, CA01/CA01b): payload real medido na sessão de descoberta contra os provedores de
 * catálogo. O Cosmos devolveu, para os dois GTINs, milímetro gravado como centímetro e grama
 * gravada como quilo — o defeito é sistemático, não pontual (spec.md P3).
 *
 * Os payloads `*_RAW_COSMOS_PAYLOAD` são o formato bruto do provedor (dimensões documentadas em
 * centímetro, peso em quilo) — servem de fixture para o gateway da Fase 3, que ainda não existe.
 * Os `*_CANDIDATE` já são a normalização em milímetro/grama que a sanidade (Fase 1) consome — sem
 * gateway ainda, a normalização "óbvia" (cm × 10, kg × 1000) foi feita à mão aqui e é exatamente a
 * que produz os números rejeitados no CA01/CA01b.
 *
 * ⚠️ Os tipos abaixo são definidos aqui, não importados de `package-box-catalog-sanity.policy.ts`:
 * a fixture nasce na T001, antes da política existir (T004) — o formato é o mesmo por desenho
 * estrutural (duck typing do TS), sem acoplar a fixture a um módulo que ainda não existe.
 */
type PackageBoxCatalogCandidate = {
  readonly grossWeightGrams: number
  readonly heightMm: number
  readonly lengthMm: number
  readonly unitsPerBox: number
  readonly widthMm: number
}

type PackageBoxCatalogContentReference = {
  readonly categoryDensityRangeKgPerM3?: {
    readonly maxKgPerM3: number
    readonly minKgPerM3: number
  }
  readonly unitNetWeightGrams?: number
}

/** GTIN 7896098909768 — LAVA-ROUPAS PÓ CONCENTRADO PRIMAVERA TIXAN YPÊ CAIXA 1,6KG. */
export const TIXAN_RAW_COSMOS_PAYLOAD = {
  brand: { name: 'YPÊ', picture: '' },
  carton: {
    box_type: 'Caixa',
    gross_weight_kg: 0.015,
    gtin: '17896098909765',
    height_cm: 240.0,
    layer_quantity: 10,
    length_cm: 474.0,
    net_weight_kg: 0.014,
    quantity: 9,
    stack_quantity: 6,
    width_cm: 247.0,
  },
  description: 'LAVA-ROUPAS PO CONCENTRADO PRIMAVERA TIXAN YPE CAIXA 1,6KG',
  gtin: '7896098909768',
} as const

/** Normalização mm/g do payload acima: cm × 10, kg × 1000 — os números que o CA01 rejeita. */
export const TIXAN_CANDIDATE: PackageBoxCatalogCandidate = {
  grossWeightGrams: 15,
  heightMm: 2400,
  lengthMm: 4740,
  unitsPerBox: 9,
  widthMm: 2470,
}

/** Peso líquido unitário conhecido do produto (1,6 kg) — usado pela sanidade do RF05. */
export const TIXAN_CONTENT: PackageBoxCatalogContentReference = {
  unitNetWeightGrams: 1600,
}

/**
 * GTIN 7898963886129 — BATATA PALHA PRECIOSA TRADICIONAL 500G, NCM 2005.20.00.
 * Densidade solta de batata palha: 100–150 kg/m³ (spec.md RF05, CA01b).
 */
export const BATATA_PALHA_RAW_COSMOS_PAYLOAD = {
  carton: {
    box_type: 'Caixa',
    gross_weight_kg: 0.01,
    gtin: '17898963886126',
    height_cm: 220.0,
    length_cm: 365.0,
    net_weight_kg: 0.01,
    quantity: 20,
    width_cm: 256.0,
  },
  description: 'BATATA PALHA PRECIOSA TRADICIONAL 500G',
  gtin: '7898963886129',
  ncm: { code: '20052000', description: 'Outros produtos preparados' },
} as const

/** Normalização mm/g "como veio" (cm × 10, kg × 1000) — o CA01b rejeita por duas frentes. */
export const BATATA_PALHA_CANDIDATE_AS_PROVIDED: PackageBoxCatalogCandidate = {
  grossWeightGrams: 10,
  heightMm: 2200,
  lengthMm: 3650,
  unitsPerBox: 20,
  widthMm: 2560,
}

/**
 * A hipótese "cabe se mm" (RF06): o mesmo número do provedor, tratado como já estando em milímetro
 * (sem multiplicar por 10) — 36,5 × 22,0 × 25,6 cm = 20,6 L. RF06 proíbe corrigir sozinho; esta
 * fixture existe só para provar, no CA01b, que mesmo essa leitura mais generosa continua
 * fisicamente impossível para o conteúdo (densidade da caixa dá 486 kg/m³, acima da faixa
 * 100–150 kg/m³ da categoria).
 */
export const BATATA_PALHA_CANDIDATE_REINTERPRETED_MM: PackageBoxCatalogCandidate = {
  grossWeightGrams: 10,
  heightMm: 220,
  lengthMm: 365,
  unitsPerBox: 20,
  widthMm: 256,
}

/** Peso líquido unitário (500 g) e a faixa de densidade solta por NCM — 100–150 kg/m³. */
export const BATATA_PALHA_CONTENT: PackageBoxCatalogContentReference = {
  categoryDensityRangeKgPerM3: { maxKgPerM3: 150, minKgPerM3: 100 },
  unitNetWeightGrams: 500,
}

/**
 * Mesmo conteúdo, mas sem a faixa de densidade por NCM cadastrada — RF05: "NCM sem faixa conhecida
 * não promove por densidade (só rejeita nos outros códigos)".
 */
export const BATATA_PALHA_CONTENT_WITHOUT_DENSITY_RANGE: PackageBoxCatalogContentReference = {
  unitNetWeightGrams: 500,
}

/**
 * Uma faixa de densidade genérica (a que o plan.md descarta) deixaria a batata palha passar —
 * prova de que a faixa por NCM é necessária, não um genérico único (spec.md RF05).
 */
export const GENERIC_DENSITY_RANGE_CONTENT: PackageBoxCatalogContentReference = {
  categoryDensityRangeKgPerM3: { maxKgPerM3: 1200, minKgPerM3: 50 },
  unitNetWeightGrams: 500,
}

/**
 * O formato de retorno do Cosmos, da documentação oficial (AÇÚCAR REFINADO UNIÃO 1KG) — vem com
 * `height`/`length`/`width` = 0.0. Fixture reservada ao gateway da Fase 3: `0` é "sem dimensão"
 * (ausente), nunca medida válida, e é o gateway que faz essa normalização antes de a sanidade ver
 * o dado — a política pura de sanidade (Fase 1) não recebe dimensão zero.
 */
export const COSMOS_ZERO_DIMENSION_RAW_PAYLOAD = {
  avg_price: 2.99,
  brand: { name: 'UNIÃO', picture: '' },
  description: 'AÇÚCAR REFINADO UNIÃO 1KG',
  gpc: { code: '10000043', description: '...' },
  gross_weight: 1000,
  gtin: 7891910000197,
  height: 0.0,
  length: 0.0,
  max_price: 2.99,
  ncm: { code: '17019900', description: 'Outros', full_description: '...' },
  net_weight: 1000,
  price: 'R$ 2,99',
  thumbnail: '...',
  width: 0.0,
} as const
