/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * A `addressKey` não aparece no relatório desta empresa — pediu correção de um endereço que não é
 * dela, ou que a rotina de medição nunca viu. Mesmo 404 de `PostalCodeNotFoundError`/
 * `DeliveryClientNotFoundError`: o servidor procurou e não achou, não é o corpo que veio malformado.
 */
export class AddressCorrectionAddressNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'ADDRESS_CORRECTION_ADDRESS_NOT_FOUND',
      message: 'Address key was not found in this company report',
      status: 404,
    })
  }
}

/**
 * RF4/RF5: a contratante é resolvida pelo CNPJ do emitente da nota mais recente daquela chave,
 * dentro da empresa do token — e o CNPJ do emitente pode não ter cadastro de contratante ainda.
 * `404`, não `409`: segue `ContractorNotFoundError` (`delivery-clients/domain/delivery-client.error.ts`),
 * o mesmo caso de "procurei o cadastro pelo documento e ele não existe" — não uma pré-condição de
 * outro recurso que o cliente já sabe que existe (esse é o caso de `MdfeFiscalSettingsMissingError`,
 * `409`).
 */
export class AddressCorrectionContractorNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'ADDRESS_CORRECTION_CONTRACTOR_NOT_FOUND',
      message: 'No contractor is registered in this company for the tax id of the issuer',
      status: 404,
    })
  }
}
