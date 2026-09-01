import type { CrlvValues } from '@adatechnology/document-intake'

import { normalizeTaxId } from '@/modules/shared/taxId.service'

/**
 * Spec 071: **o CRLV preenche o campo dele, esteja ele no bloco que estiver.** O documento traz nome
 * e CPF do proprietário e o município/UF — nada disso é dado de veículo, e parar no bloco Veículo
 * jogaria fora metade da leitura por causa de onde o campo mora na tela.
 *
 * A extração mora em `@adatechnology/document-intake`; o que depende de **ter formulário** — encaixar
 * no campo vazio e comparar com o que a pessoa digitou — é o que fica aqui.
 */
export type CrlvDeclaredFields = Readonly<{
  city: string
  name: string
  state: string
  taxId: string
  vehicleBrand: string
  vehicleModel: string
  vehicleModelYear: string
  vehiclePlate: string
}>

/**
 * O mapa da spec, por extenso: cada campo do documento e a coluna do formulário que ele preenche.
 * Escrito como dado, e não como um `if` por campo, porque é ele que o contrato percorre — o risco
 * desta função é campo esquecido, e lista esquecida se vê.
 */
const FILLED_BY: readonly Readonly<{
  field: keyof CrlvDeclaredFields
  read: (values: Partial<CrlvValues>) => string | undefined
}>[] = [
  { field: 'vehiclePlate', read: (values) => values.plate },
  { field: 'vehicleBrand', read: (values) => values.brand },
  { field: 'vehicleModel', read: (values) => values.model },
  { field: 'vehicleModelYear', read: (values) => values.modelYear },
  { field: 'name', read: (values) => values.ownerName },
  { field: 'taxId', read: (values) => values.ownerTaxId },
  { field: 'city', read: (values) => values.municipality },
  { field: 'state', read: (values) => values.state },
]

/**
 * Entra **só no que está vazio**. Nada sobrescreve o que a pessoa digitou — nem o nome, que é o
 * campo onde o documento mais costuma discordar dela de propósito (ver `listCrlvDivergences`).
 */
export function mergeCrlvIntoFields(input: {
  readonly current: CrlvDeclaredFields
  readonly values: Partial<CrlvValues>
}): CrlvDeclaredFields {
  const filled: Record<string, string> = { ...input.current }

  for (const { field, read } of FILLED_BY) {
    if (filled[field] !== '') continue
    const readValue = read(input.values)
    if (readValue !== undefined && readValue !== '') filled[field] = readValue
  }

  return filled as unknown as CrlvDeclaredFields
}

export type CrlvDivergence = Readonly<{
  declared: string
  field: string
  read: string
}>

const COMPARED: readonly Readonly<{
  field: 'name' | 'taxId' | 'vehiclePlate'
  read: (values: Partial<CrlvValues>) => string | undefined
}>[] = [
  { field: 'name', read: (values) => values.ownerName },
  { field: 'taxId', read: (values) => values.ownerTaxId },
  { field: 'vehiclePlate', read: (values) => values.plate },
]

/**
 * **Avisa, não corrige.** Agregado que roda com veículo no nome de terceiro é caso normal, e ali o
 * proprietário lido diverge de propósito de quem se candidata: isso é informação para o operador,
 * não erro do candidato — por isso nada aqui bloqueia envio nem reescreve campo.
 *
 * Campo em branco não é divergência (é o que o merge vai preencher) e campo que o documento não
 * trouxe também não (ausência nunca é conflito): tratá-los como tal treinaria o operador a ignorar
 * o aviso. A comparação de documento é canônica — máscara é do teclado, não do dado.
 */
export function listCrlvDivergences(input: {
  readonly current: CrlvDeclaredFields
  readonly values: Partial<CrlvValues>
}): readonly CrlvDivergence[] {
  const divergences: CrlvDivergence[] = []

  for (const { field, read } of COMPARED) {
    const readValue = read(input.values)
    const declared = input.current[field]
    if (readValue === undefined || declared === '') continue

    const left = field === 'taxId' ? normalizeTaxId(declared) : declared.trim().toUpperCase()
    const right = field === 'taxId' ? normalizeTaxId(readValue) : readValue.trim().toUpperCase()
    if (left === right) continue

    divergences.push({ declared: left, field, read: right })
  }

  return divergences
}
