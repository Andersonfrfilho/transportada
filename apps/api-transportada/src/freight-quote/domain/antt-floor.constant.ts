/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Piso mínimo de frete da ANTT (PNPM-TRC): `piso = km × CCD + CC`.
 *
 * Fonte oficial: Resolução ANTT nº 6.084, de 16/07/2026 (Anexo II, em vigor desde 17/07/2026), que
 * substituiu os coeficientes do Anexo II da Resolução nº 5.867/2020, alterada pela nº 6.076/2026.
 * A fórmula e as regras (Art. 5 da 6.076) seguem valendo. Texto em https://anttlegis.antt.gov.br.
 *
 * ⚠️ O piso é lei, não parâmetro da empresa: não é editável pela tela. Quando a ANTT publicar nova
 * tabela, este arquivo muda por PR (e `ANTT_FLOOR_SOURCE` junto). Só entram as Tabelas A (carga
 * lotação, composição ou caminhão simples) e C (alto desempenho, idem); as B e D (só unidade de
 * tração) ficam fora desta primeira versão. Eixo ausente na tabela usa o vizinho (Art. 5 §5).
 */
export const ANTT_FLOOR_SOURCE = {
  effectiveFrom: '2026-07-17',
  resolution:
    'Resolução ANTT nº 6.084/2026 (Anexo II); fórmula do Art. 5 da Resolução nº 6.076/2026',
  url: 'https://anttlegis.antt.gov.br/action/ActionDatalegis.php?acao=abrirTextoAto&tipo=RES&numeroAto=00006084&seqAto=000&valorAno=2026&orgao=DG%2FANTT%2FMT&cod_modulo=623&cod_menu=9230',
} as const

/** Colunas da tabela, na ordem: não existe coluna de 8 eixos na norma. */
export const ANTT_FLOOR_AXLES = [2, 3, 4, 5, 6, 7, 9] as const
export type AnttFloorAxles = (typeof ANTT_FLOOR_AXLES)[number]

export const ANTT_CARGO_TYPES = [
  { code: 1, label: 'Granel sólido' },
  { code: 2, label: 'Granel líquido' },
  { code: 3, label: 'Frigorificada ou aquecida' },
  { code: 4, label: 'Conteinerizada' },
  { code: 5, label: 'Carga geral' },
  { code: 6, label: 'Neogranel' },
  { code: 7, label: 'Perigosa (granel sólido)' },
  { code: 8, label: 'Perigosa (granel líquido)' },
  { code: 9, label: 'Perigosa (frigorificada ou aquecida)' },
  { code: 10, label: 'Perigosa (conteinerizada)' },
  { code: 11, label: 'Perigosa (carga geral)' },
  { code: 12, label: 'Carga granel pressurizada' },
] as const

export type AnttCargoTypeCode = (typeof ANTT_CARGO_TYPES)[number]['code']
export type AnttFloorTable = 'A' | 'C'

/** `[CCD em R$/km, CC em R$]` por eixo (2,3,4,5,6,7,9); `null` onde a norma deixa a célula vazia. */
type Cell = readonly [string, string] | null
type Row = readonly [Cell, Cell, Cell, Cell, Cell, Cell, Cell]

const N: Cell = null

const TABLE_A: Readonly<Record<AnttCargoTypeCode, Row>> = {
  1: [
    ['4.0144', '460.59'],
    ['5.1355', '552.24'],
    ['5.8118', '597.00'],
    ['6.6983', '664.83'],
    ['7.3841', '680.01'],
    ['8.0516', '820.34'],
    ['9.2231', '908.91'],
  ],
  2: [
    ['4.0884', '471.98'],
    ['5.2311', '569.57'],
    ['5.9661', '621.52'],
    ['6.8661', '693.08'],
    ['7.5572', '709.72'],
    ['8.1900', '840.50'],
    ['9.3822', '934.76'],
  ],
  3: [
    ['4.7095', '520.07'],
    ['6.0159', '623.27'],
    ['6.8646', '686.63'],
    ['7.8666', '757.98'],
    ['8.6661', '772.35'],
    ['9.5884', '982.76'],
    ['10.8870', '1067.06'],
  ],
  4: [
    N,
    ['5.1082', '544.75'],
    ['5.7396', '577.15'],
    ['6.6345', '647.29'],
    ['7.3186', '662.01'],
    ['8.0492', '819.69'],
    ['9.1399', '886.05'],
  ],
  5: [
    ['3.9826', '451.84'],
    ['5.0977', '541.86'],
    ['5.7822', '588.86'],
    ['6.6718', '657.56'],
    ['7.3547', '671.93'],
    ['8.0927', '831.66'],
    ['9.2027', '903.32'],
  ],
  6: [
    ['3.6023', '451.84'],
    ['5.0962', '541.44'],
    ['5.8094', '596.35'],
    ['6.6718', '657.56'],
    ['7.3547', '671.93'],
    ['8.0927', '831.66'],
    ['9.2027', '903.32'],
  ],
  7: [
    ['4.7845', '608.79'],
    ['5.9154', '703.16'],
    ['6.6285', '753.03'],
    ['7.5150', '820.86'],
    ['8.2008', '836.04'],
    ['8.8866', '981.39'],
    ['10.0660', '1072.15'],
  ],
  8: [
    ['4.8710', '632.58'],
    ['6.0236', '732.90'],
    ['6.7628', '789.96'],
    ['7.6628', '861.51'],
    ['8.3539', '878.16'],
    ['9.0049', '1013.95'],
    ['10.2051', '1110.41'],
  ],
  9: [
    ['5.3176', '630.88'],
    ['6.6369', '737.63'],
    ['7.5020', '807.63'],
    ['8.5039', '878.98'],
    ['9.3034', '893.35'],
    ['10.2495', '1110.28'],
    ['11.5584', '1197.43'],
  ],
  10: [
    N,
    ['5.4926', '645.45'],
    ['6.1608', '682.95'],
    ['7.0556', '753.10'],
    ['7.7398', '767.81'],
    ['8.4886', '930.51'],
    ['9.5873', '999.06'],
  ],
  11: [
    ['4.3571', '549.81'],
    ['5.4821', '642.55'],
    ['6.2033', '694.66'],
    ['7.0930', '763.36'],
    ['7.7758', '777.73'],
    ['8.5321', '942.48'],
    ['9.6501', '1016.33'],
  ],
  12: [N, N, N, ['7.0364', '757.81'], ['7.7652', '784.82'], N, ['9.7444', '1052.26']],
}

const TABLE_C: Readonly<Record<AnttCargoTypeCode, Row>> = {
  1: [
    ['3.3964', '174.38'],
    ['4.3276', '198.05'],
    ['4.9441', '215.03'],
    ['5.6725', '229.64'],
    ['6.3229', '232.91'],
    ['6.7071', '270.36'],
    ['7.6912', '292.59'],
  ],
  2: [
    ['3.4439', '176.84'],
    ['4.3828', '201.78'],
    ['5.0412', '220.31'],
    ['5.7745', '235.73'],
    ['6.4268', '239.32'],
    ['6.7985', '274.70'],
    ['7.7901', '298.16'],
  ],
  3: [
    ['4.0647', '205.65'],
    ['5.1615', '232.97'],
    ['5.9203', '256.16'],
    ['6.7560', '271.54'],
    ['7.5220', '274.63'],
    ['8.0108', '329.34'],
    ['9.1377', '351.60'],
  ],
  4: [
    N,
    ['4.3178', '196.43'],
    ['4.9182', '210.75'],
    ['5.6496', '225.87'],
    ['6.2994', '229.04'],
    ['6.7062', '270.22'],
    ['7.6614', '287.67'],
  ],
  5: [
    ['3.3850', '172.50'],
    ['4.3141', '195.81'],
    ['4.9335', '213.27'],
    ['5.6630', '228.08'],
    ['6.3124', '231.17'],
    ['6.7218', '272.80'],
    ['7.6839', '291.39'],
  ],
  6: [
    ['3.0047', '172.50'],
    ['4.3135', '195.72'],
    ['4.9432', '214.89'],
    ['5.6630', '228.08'],
    ['6.3124', '231.17'],
    ['6.7218', '272.80'],
    ['7.6839', '291.39'],
  ],
  7: [
    ['3.9329', '224.77'],
    ['4.8748', '250.19'],
    ['5.5294', '270.47'],
    ['6.2578', '285.09'],
    ['6.9083', '288.36'],
    ['7.3121', '329.05'],
    ['8.3048', '352.70'],
  ],
  8: [
    ['3.9640', '229.89'],
    ['4.9136', '256.60'],
    ['5.5777', '278.43'],
    ['6.3109', '293.85'],
    ['6.9633', '297.43'],
    ['7.3546', '336.06'],
    ['8.3548', '360.94'],
  ],
  9: [
    ['4.5599', '253.51'],
    ['5.6705', '283.12'],
    ['6.4476', '310.60'],
    ['7.2833', '325.98'],
    ['8.0493', '329.07'],
    ['8.5636', '388.00'],
    ['9.7016', '412.10'],
  ],
  10: [
    N,
    ['4.5865', '237.75'],
    ['5.2250', '255.37'],
    ['5.9564', '270.49'],
    ['6.6062', '273.66'],
    ['7.0327', '318.08'],
    ['7.9965', '336.95'],
  ],
  11: [
    ['3.6430', '212.06'],
    ['4.5827', '237.13'],
    ['5.2403', '257.89'],
    ['5.9698', '272.70'],
    ['6.6192', '275.79'],
    ['7.0483', '320.66'],
    ['8.0190', '340.67'],
  ],
  12: [N, N, N, ['5.7939', '249.68'], ['6.4598', '255.50'], N, ['7.8784', '323.48']],
}

export const ANTT_FLOOR_TABLES: Readonly<
  Record<AnttFloorTable, Readonly<Record<AnttCargoTypeCode, Row>>>
> = {
  A: TABLE_A,
  C: TABLE_C,
}

export type AnttFloorCoefficients = {
  readonly axlesUsed: AnttFloorAxles
  readonly cc: string
  readonly ccd: string
}

/**
 * Coeficientes do tipo de carga e do número de eixos. Eixo fora da tabela (ou célula vazia) usa o
 * vizinho — o menor primeiro, e o maior se não houver menor (Art. 5 §5). `null` só quando a linha
 * inteira está vazia, o que a norma não publica.
 */
export function findAnttFloorCoefficients(input: {
  readonly axles: number
  readonly cargoType: AnttCargoTypeCode
  readonly table: AnttFloorTable
}): AnttFloorCoefficients | null {
  const row = ANTT_FLOOR_TABLES[input.table][input.cargoType]
  const indexes = ANTT_FLOOR_AXLES.map((_axles, index) => index)
  const exact = indexes.filter((index) => ANTT_FLOOR_AXLES[index] === input.axles)
  const lower = indexes.filter((index) => (ANTT_FLOOR_AXLES[index] ?? 0) < input.axles).reverse()
  const higher = indexes.filter((index) => (ANTT_FLOOR_AXLES[index] ?? 0) > input.axles)
  for (const index of [...exact, ...lower, ...higher]) {
    const cell = row[index]
    const axlesUsed = ANTT_FLOOR_AXLES[index]
    if (cell !== null && cell !== undefined && axlesUsed !== undefined) {
      return { axlesUsed, cc: cell[1], ccd: cell[0] }
    }
  }
  return null
}
