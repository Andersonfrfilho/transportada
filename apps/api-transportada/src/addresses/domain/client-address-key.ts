/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A chave que amarra uma correção de endereço ao **cliente**, e não só ao texto da nota.
 *
 * ⚠️ **Por que o cliente entra na chave.** `buildStopAddressKey` é `cidade|CEP|número` e **não tem a
 * rua** — duas grafias do mesmo logradouro no mesmo CEP e número já produzem a mesma chave hoje. O
 * que varia de verdade é o CEP: medido nesta base, três casos de mesma cidade e mesmo número com
 * CEPs diferentes ("PORTO FERREIRA nº 25" tem três). Amarrar ao cliente permite reconhecer o mesmo
 * lugar quando o emitente digita outro CEP.
 *
 * ⚠️ **Por que a rua entra também.** Sem ela, `(cliente, cidade, número)` colapsaria endereços
 * distintos — e a parada agrupa por endereço, nunca por CNPJ, justamente porque *"a mesma rede em
 * cinco lojas é cinco paradas"*. Duas lojas no mesmo número de ruas diferentes viram duas linhas.
 */

/** Tipo de via: varia à vontade (`R`, `RUA`, `AV`, `AVENIDA`) e não identifica nada. */
const STREET_PREFIXES = new Set([
  'R',
  'RUA',
  'AV',
  'AVN',
  'AVENIDA',
  'TV',
  'TRAV',
  'TRAVESSA',
  'AL',
  'ALAMEDA',
  'PC',
  'PRACA',
  'ROD',
  'RODOVIA',
  'EST',
  'ESTRADA',
  'VIA',
  'LGO',
  'LARGO',
])

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
}

/**
 * A grafia canônica do logradouro — acento, pontuação e tipo de via fora, espaços colapsados.
 *
 * ⚠️ **Isto é canonicalização, não semelhança.** `RUA 02` e `RUA 12` continuam sendo chaves
 * diferentes, e é assim que tem de ser: medido nesta base, casar nome de rua por distância de edição
 * deu 14% de acerto **com falsos positivos** que mandavam um para o outro. Num roteiro isso é erro
 * com aparência de acerto. Aqui só se colapsa o que é indiscutivelmente a mesma escrita.
 *
 * Consequência aceita: `DR. MATTA` e `DR MATA` produzem chaves diferentes. Elas viram duas linhas, a
 * consulta acha duas e **não aplica nada** — falha segura, e o relatório pergunta a um humano se são
 * o mesmo lugar.
 */
export function buildClientStreetKey(street: null | string): string {
  const upper = stripAccents(street ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
  if (upper.length === 0) return ''

  const tokens = upper.split(' ')
  const first = tokens[0] ?? ''
  return (STREET_PREFIXES.has(first) ? tokens.slice(1) : tokens).join(' ')
}

export type ClientAddressCandidate = Readonly<{
  addressKey: string
  streetKey: string
}>

export type ClientAddressMatch =
  | Readonly<{ addressKey: string; outcome: 'resolved' }>
  | Readonly<{ outcome: 'ambiguous'; streetKeys: readonly string[] }>
  | Readonly<{ outcome: 'unknown' }>

/**
 * ⚠️ **Candidato ambíguo não se aplica sozinho.** Com duas ruas gravadas para o mesmo cliente,
 * cidade e número, não há como saber qual delas a nota nova quer — e escolher uma manda o caminhão
 * para a outra. Ambíguo vai ao relatório; ele **não** vira coordenada.
 *
 * A rua da nota entra na decisão quando ela bate exatamente com uma das gravadas: aí não há dúvida,
 * mesmo havendo duas candidatas.
 */
export function resolveClientAddress(input: {
  readonly candidates: readonly ClientAddressCandidate[]
  readonly streetKey: string
}): ClientAddressMatch {
  if (input.candidates.length === 0) return { outcome: 'unknown' }

  /**
   * ⚠️ A rua **tem** de bater. Aceitar a candidata única sem conferi-la seria o casamento mais
   * permissivo possível — distância infinita —, justamente o que a spec rejeita depois de medir 14%
   * de acerto com falsos positivos. Duas revisões independentes pegaram isto: com a loja da "RUA DAS
   * FLORES nº 25" na agenda, a nota da loja da "AVENIDA BRASIL nº 25" recebia a coordenada da
   * primeira, calada.
   *
   * Rua vazia também não resolve: sem o eixo que distingue os dois lugares, não há o que conferir.
   */
  if (input.streetKey.length === 0) return { outcome: 'unknown' }

  const exact = input.candidates.find((candidate) => candidate.streetKey === input.streetKey)
  if (exact !== undefined) return { addressKey: exact.addressKey, outcome: 'resolved' }

  /**
   * Nenhuma bateu. Com **uma** candidata isso é ausência — a agenda não conhece esta rua, e o degrau
   * seguinte é o CEP, que é grátis e nosso. Com **duas ou mais**, é ambiguidade de verdade: existem
   * lugares distintos naquele número e nenhum deles é o desta nota, o que é informação para o
   * relatório.
   */
  if (input.candidates.length === 1) return { outcome: 'unknown' }

  return {
    outcome: 'ambiguous',
    streetKeys: input.candidates.map((candidate) => candidate.streetKey),
  }
}
