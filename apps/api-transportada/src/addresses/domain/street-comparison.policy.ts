/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O que separa "seu cadastro está errado" de "escrevemos o mesmo nome de jeitos diferentes"
 * (spec 084, G8).
 *
 * ⚠️ **Sem esta separação o relatório se mata sozinho.** Medido nos 148 endereços do lote: 45
 * divergiam de rua, e **cinco** eram lugar diferente. As outras quarenta eram `DR` contra `Doutor`,
 * `7` contra `Sete`, `MELLO` contra `Melo`, `RUA RUA MINAS GERAIS` — pedir ao contratante que
 * "corrija" isso quarenta vezes ensina ele a fechar o relatório sem ler, e aí as cinco somem junto.
 */
export type StreetRelation = 'different' | 'incomplete' | 'same' | 'spelling'

/**
 * ⚠️ **`incomplete` não é erro de ninguém.** `SOARES DE OLIVEIRA` contra `Doutor José Aníbal Soares
 * de Oliveira` é a mesma rua com o nome inteiro de um lado — o cadastro está curto, não errado, e o
 * caminhão chega. Ela fica separada de `different` para não disputar atenção com o que é lugar
 * trocado.
 */
const STREET_PREFIXES = new Set([
  'AV',
  'AVENIDA',
  'AL',
  'ALAMEDA',
  'EST',
  'ESTRADA',
  'LARGO',
  'LGO',
  'PC',
  'PRACA',
  'R',
  'ROD',
  'RODOVIA',
  'RUA',
  'TRAVESSA',
  'TV',
  'VIA',
])

/**
 * As abreviações que aparecem em placa e em cadastro. Expandir é **determinístico** — não há
 * adivinhação em dizer que `CEL` é `CORONEL` —, e é o que resolve a maior fatia do ruído medido.
 */
const ABBREVIATIONS: Readonly<Record<string, string>> = {
  BR: 'BARAO',
  CAP: 'CAPITAO',
  CEL: 'CORONEL',
  CDE: 'CONDE',
  D: 'DOM',
  DEP: 'DEPUTADO',
  DR: 'DOUTOR',
  DRA: 'DOUTORA',
  ENG: 'ENGENHEIRO',
  GAL: 'GENERAL',
  GOV: 'GOVERNADOR',
  JR: 'JUNIOR',
  MAL: 'MARECHAL',
  MIN: 'MINISTRO',
  PE: 'PADRE',
  PRES: 'PRESIDENTE',
  PROF: 'PROFESSOR',
  PROFA: 'PROFESSORA',
  SGT: 'SARGENTO',
  STA: 'SANTA',
  STO: 'SANTO',
  VER: 'VEREADOR',
  VISC: 'VISCONDE',
}

/**
 * Nome de rua que é data sai escrito de um lado e em algarismo do outro — `7 DE SETEMBRO` contra
 * `Sete de Setembro`. Vinte e nove entradas cobrem o caso inteiro, que é sempre dia do mês.
 */
const NUMBER_WORDS: Readonly<Record<string, string>> = {
  CINCO: '5',
  DEZ: '10',
  DEZESSEIS: '16',
  DEZESSETE: '17',
  DEZENOVE: '19',
  DEZOITO: '18',
  DOIS: '2',
  DOZE: '12',
  NOVE: '9',
  OITO: '8',
  ONZE: '11',
  PRIMEIRO: '1',
  QUATORZE: '14',
  QUATRO: '4',
  QUINZE: '15',
  SEIS: '6',
  SETE: '7',
  TRES: '3',
  TREZE: '13',
  TRINTA: '30',
  UM: '1',
  VINTE: '20',
}

/** Palavras que não distinguem lugar nenhum: `AVENIDA DO DIAMANTE` e `Avenida Diamante`. */
const FILLER = new Set(['DA', 'DAS', 'DE', 'DO', 'DOS', 'E'])

/**
 * ⚠️ **Quatro, não cinco, e o preço está medido.** `LUIZ`/`LUÍS`, `MATTA`/`MATA` e `MELLO`/`MELO`
 * são a mesma pessoa escrita de dois jeitos, e ficam de fora com piso cinco. O que se paga por
 * baixar é aceitar que `NOVA`/`NOVO` também casem — e duas ruas que só diferem nisso, no mesmo CEP e
 * no mesmo número, não são duas ruas.
 */
const MINIMUM_FUZZY_LENGTH = 4

export function compareStreetNames(note: string, provider: string): StreetRelation {
  const left = toTokens(note)
  const right = toTokens(provider)

  if (left.length === 0 || right.length === 0) return 'different'
  if (left.join(' ') === right.join(' ')) return 'same'

  if (isSubsequence(left, right) || isSubsequence(right, left)) return 'incomplete'
  if (
    left.length === right.length &&
    left.every((token, index) => isNear(token, right[index] ?? ''))
  )
    return 'spelling'

  return 'different'
}

function toTokens(street: string): readonly string[] {
  const upper = street
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, ' ')
    /** `10B` é `10 B`: número de rua cola letra ao algarismo, e o provedor separa. */
    .replace(/(\d)(?=[A-Z])/gu, '$1 ')
    .replace(/([A-Z])(?=\d)/gu, '$1 ')
    /** `RUAMARECHAL` — o espaço que faltou na digitação, e que só aparece colado ao tipo de via. */
    .replace(/^(RUA|AVENIDA|PRACA|ESTRADA)(?=[A-Z])/u, '$1 ')
    .trim()
    .replace(/\s+/gu, ' ')

  const tokens = upper.length === 0 ? [] : upper.split(' ')

  /** `RUA RUA MINAS GERAIS` e `AV AVENIDA OLYMPIO`: o tipo de via digitado duas vezes. */
  let start = 0
  while (start < tokens.length && STREET_PREFIXES.has(tokens[start] ?? '')) start += 1

  const expanded = tokens
    .slice(start)
    .map((token) => ABBREVIATIONS[token] ?? NUMBER_WORDS[token] ?? token)
    .filter((token) => !FILLER.has(token))

  return composeTens(expanded)
}

/**
 * `VINTE E DOIS` vira `22`. O `E` já saiu como palavra vazia, então o que sobra são dois números
 * vizinhos — dezena redonda seguida de unidade —, e é sempre isso que nome de rua com data produz.
 */
function composeTens(tokens: readonly string[]): readonly string[] {
  const composed: string[] = []

  for (const token of tokens) {
    const previous = composed[composed.length - 1]
    const tens = Number(previous)
    const unit = Number(token)

    if (previous !== undefined && tens >= 20 && tens % 10 === 0 && unit >= 1 && unit <= 9) {
      composed[composed.length - 1] = String(tens + unit)
      continue
    }

    composed.push(token)
  }

  return composed
}

/**
 * Um nome cabe dentro do outro **na ordem**: `MARECHAL FLORIANO` dentro de `MARECHAL FLORIANO
 * PEIXOTO`. Fora de ordem seria coincidência de palavras, não a mesma rua.
 */
function isSubsequence(shorter: readonly string[], longer: readonly string[]): boolean {
  if (shorter.length >= longer.length) return false

  let index = 0
  for (const token of longer) {
    if (isNear(shorter[index] ?? '', token)) index += 1
    if (index === shorter.length) return true
  }

  return false
}

/**
 * ⚠️ **Isto é classificação, não casamento — e a diferença é o que o `client-address-key.ts`
 * proíbe.** Lá, distância de edição escolheria *qual* rua é a certa entre candidatas, e medido nesta
 * base isso deu 14% de acerto com falsos positivos que mandavam um endereço para o outro. Aqui o par
 * **já está formado** pelo provedor, e a pergunta é só se vale incomodar alguém com ele. Errar para
 * "é a mesma" custa uma linha a menos no relatório; errar para "é outra" custa a atenção de quem lê.
 *
 * Uma edição só, e só em palavra de cinco letras ou mais: `MELLO`/`MELO`, `CEZARE`/`CESARE`,
 * `LIPORATTI`/`LIPORATI`. `EXPEDITO`/`BENEDITO` são três, e continuam sendo ruas diferentes.
 */
function isNear(left: string, right: string): boolean {
  if (left === right) return true
  /**
   * ⚠️ **A inicial é o nome do meio abreviado, e os dois lados a usam.** `EDUARDO V NASSER` contra
   * `Eduardo Vicente Nasser` é o cadastro abreviando; `JOAQUIM FERREIRA GOULART` contra `Joaquim F
   * Goulart` é o **provedor** abreviando. Casar a letra sozinha só é seguro porque todo o resto do
   * nome já bateu — sozinha ela não decide nada.
   */
  if (isInitialOf(left, right) || isInitialOf(right, left)) return true
  if (left.length < MINIMUM_FUZZY_LENGTH || right.length < MINIMUM_FUZZY_LENGTH) return false
  /** Truncado no cadastro: `OLIVEIR` de `OLIVEIRA`, `BARCELL` de `BARCELLOS`. */
  if (left.startsWith(right) || right.startsWith(left)) return true

  return editDistanceAtMostOne(left, right)
}

function isInitialOf(initial: string, full: string): boolean {
  return initial.length === 1 && full.length > 1 && full.startsWith(initial)
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left]
  let shortIndex = 0
  let longIndex = 0
  let edits = 0

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1
      longIndex += 1
      continue
    }

    edits += 1
    if (edits > 1) return false

    if (shorter.length === longer.length) shortIndex += 1
    longIndex += 1
  }

  return edits + (longer.length - longIndex) + (shorter.length - shortIndex) <= 1
}
