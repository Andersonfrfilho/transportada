/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 065 D3: **quem decide o documento é o município de entrega.** Transporte dentro do município
 * da transportadora é serviço municipal — ISS, NFS-e. Cruzando município é ICMS, CT-e.
 *
 * A comparação é por **código IBGE**, nunca por nome: "Ribeirão Preto", "RIBEIRAO PRETO" e
 * "Rib. Preto" são a mesma cidade e três strings diferentes.
 *
 * ⚠️ **Ressalva registrada, e é escolha consciente do mantenedor (ADR-0047).** A regra fiscalmente
 * completa é o **par origem→destino**: transporte é municipal quando começa e termina no mesmo
 * município. "Destino = município da empresa" coincide com ela enquanto a coleta for na cidade da
 * transportadora — que é a operação de hoje. Havendo coleta em outra cidade com entrega aqui, o
 * trajeto é intermunicipal e o documento correto é **CT-e**.
 *
 * `originCityCode` já entra na assinatura, lido e comparável, justamente para a troca ser uma
 * condição neste arquivo em vez de uma refatoração.
 */
export const FISCAL_DOCUMENT_KINDS = ['cte', 'nfse'] as const
export type FiscalDocumentKind = (typeof FISCAL_DOCUMENT_KINDS)[number]

export type ResolveFiscalDocumentKindParams = {
  readonly companyCityCode: string | null
  readonly destinationCityCode: string | null
  /**
   * Município de coleta. **Não usado na regra de hoje**, e presente de propósito: é o que a regra do
   * par origem→destino vai ler no dia em que ela entrar.
   */
  readonly originCityCode: string | null
}

/**
 * `null` quando não dá para decidir — e não decidir é resposta legítima, não um chute. Nota sem
 * município de destino vira pendência explícita ("endereço sem município"); um palpite para CT-e
 * emitiria documento errado em silêncio, que é o defeito caro desta feature.
 */
export function resolveFiscalDocumentKind(
  input: ResolveFiscalDocumentKindParams,
): FiscalDocumentKind | null {
  const companyCityCode = normalizeCityCode(input.companyCityCode)
  const destinationCityCode = normalizeCityCode(input.destinationCityCode)
  if (companyCityCode === null || destinationCityCode === null) return null

  return destinationCityCode === companyCityCode ? 'nfse' : 'cte'
}

const CITY_CODE_LENGTH = 7

/** O IBGE de município tem sete dígitos; qualquer outra coisa é dado sujo, e dado sujo não decide. */
function normalizeCityCode(value: string | null): string | null {
  const digits = (value ?? '').replace(/\D/gu, '')

  return digits.length === CITY_CODE_LENGTH ? digits : null
}
