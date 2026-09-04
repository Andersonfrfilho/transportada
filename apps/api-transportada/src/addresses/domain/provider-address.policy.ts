/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ProviderMatchLevel } from '../../database/address-comparison.schema.js'
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'

/**
 * O que o provedor sabe sobre um endereço, lido do que ele devolve (spec 084, G5/RF13).
 *
 * ⚠️ Isto é **leitura**, não julgamento. Quem decide se há divergência é `compareAddresses`, e quem
 * decide se o resultado vale é `checkCityMatch` — comparar rua de outro município é comparar outra
 * coisa. Separar as três é o que permite testar a leitura sem provedor e o julgamento sem rede.
 */
export type ProviderAddress = Readonly<{
  /** O município **por nome** — o provedor não conhece código IBGE. Quem o resolve é o lote. */
  cityName: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

type GoogleAddressComponent = Readonly<{
  long_name?: unknown
  short_name?: unknown
  types?: unknown
}>

/**
 * ⚠️ **`RANGE_INTERPOLATED` tem nível próprio, e nunca é `rooftop`** (RF13). Ele é a rua certa com o
 * número **estimado** entre dois vizinhos conhecidos: palpite sobre a via. `GEOMETRIC_CENTER` e
 * `APPROXIMATE` colapsam em `approximate` porque para o relatório os dois dizem a mesma coisa — o
 * texto da nota não levou o provedor até a porta.
 */
const LEVEL_BY_LOCATION_TYPE: Readonly<Record<string, ProviderMatchLevel>> = {
  APPROXIMATE: 'approximate',
  GEOMETRIC_CENTER: 'approximate',
  RANGE_INTERPOLATED: 'range_interpolated',
  ROOFTOP: 'rooftop',
}

/**
 * ⚠️ **Ausência e desconhecido não são a mesma coisa.** Sem `location_type` o provedor não achou
 * nada (`not_found`); com um tipo que não conhecemos ele achou algo cuja finura não sabemos nomear, e
 * isso cai no **mais grosseiro que ainda significa "achou"**. Um `location_type` novo entrando como
 * `rooftop` poria um palpite de quilômetros no relatório com cara de porta conferida.
 */
export function toProviderMatchLevel(locationType: null | string | undefined): ProviderMatchLevel {
  const tipo = (locationType ?? '').trim()
  if (tipo.length === 0) return 'not_found'

  return LEVEL_BY_LOCATION_TYPE[tipo] ?? 'approximate'
}

/**
 * ⚠️ **A ordem do bairro é deliberada.** `sublocality_level_1` é o que o Brasil chama de bairro;
 * `neighborhood` costuma ser um recorte mais fino do mesmo lugar, e aceitá-lo primeiro encheria a
 * comparação de divergência de bairro que não existe.
 */
const DISTRICT_TYPES = ['sublocality_level_1', 'sublocality', 'neighborhood'] as const

export function extractProviderAddress(
  components: readonly GoogleAddressComponent[],
): ProviderAddress {
  const longName = (type: string) => pick(components, type, 'long_name')

  return {
    cityName: longName('administrative_area_level_2'),
    district: firstNonEmpty(DISTRICT_TYPES.map(longName)),
    number: longName('street_number'),
    postalCode: longName('postal_code'),
    /** A UF é a **sigla**: é ela que a nota guarda e é ela que o CHECK do banco espera. */
    state: pick(components, 'administrative_area_level_1', 'short_name'),
    street: longName('route'),
  }
}

/**
 * Componente malformado é ignorado, nunca fatal: o lote roda sobre trezentos endereços e não pode
 * parar no sétimo porque o provedor devolveu um objeto sem `types`.
 */
function pick(
  components: readonly GoogleAddressComponent[],
  type: string,
  field: 'long_name' | 'short_name',
): string {
  for (const component of components) {
    const types = component?.types
    if (!Array.isArray(types) || !types.includes(type)) continue

    const value = component[field]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }

  return ''
}

function firstNonEmpty(values: readonly string[]): string {
  return values.find((value) => value.length > 0) ?? ''
}

/**
 * O que o nível do provedor vale na cascata de precisão da **ADR-0044 §3** — e é por aqui que a
 * medição vira coordenada guardada.
 *
 * ⚠️ **`not_found` devolve `null`, e `approximate` não é melhoria.** O provedor que caiu no
 * município sabe exatamente o mesmo que a nossa escada grátis já sabia; gravá-lo como se fosse
 * conquista trocaria um centroide por outro e marcaria o endereço como resolvido. Quem decide se a
 * escrita acontece é `shouldReplaceStored`, e este mapa só lhe dá o vocabulário.
 */
export function toStoredPrecision(matchLevel: ProviderMatchLevel): GeocodingPrecision | null {
  if (matchLevel === 'not_found') return null
  if (matchLevel === 'approximate') return 'city'

  return matchLevel === 'rooftop' ? 'rooftop' : 'street'
}
