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

/**
 * T304 (RF5): todo `contactId` do body precisa resolver para um contato `active` desta contratante,
 * dentro desta empresa — inexistente, inativo ou de outra contratante recebem a mesma resposta, para
 * não revelar qual dos três motivos foi.
 */
export class AddressCorrectionNoActiveContactError extends ApiError {
  public constructor() {
    super({
      code: 'ADDRESS_CORRECTION_NO_ACTIVE_CONTACT',
      message: 'One or more contacts are not active contacts of this contractor',
      status: 422,
    })
  }
}

/** T304 (RF6a): o envio completo sem nenhum rascunho da contratante não tem o que mandar. */
export class AddressCorrectionNothingToSendError extends ApiError {
  public constructor() {
    super({
      code: 'ADDRESS_CORRECTION_NOTHING_TO_SEND',
      message: 'The contractor has no draft address correction request to send',
      status: 409,
    })
  }
}

/**
 * T304 (RF6a): `requestIds` explícito que não resolve a um rascunho `draft` desta contratante —
 * id de outra contratante, inexistente ou já `sent`.
 */
export class AddressCorrectionRequestNotSendableError extends ApiError {
  public constructor() {
    super({
      code: 'ADDRESS_CORRECTION_REQUEST_NOT_SENDABLE',
      message: 'One or more request ids are not a sendable draft of this contractor',
      status: 409,
    })
  }
}

/**
 * T304 (RF6): a mesma `Idempotency-Key` usada com um corpo diferente — mesmo código e status de
 * `idempotencyKeyReused` em `nfe-imports/application/nfe-import.error.ts`, redeclarado aqui porque
 * cada domínio deste repositório guarda o seu (`freight-rules`, `cte-batches` fazem o mesmo).
 */
export class AddressCorrectionIdempotencyKeyReusedError extends ApiError {
  public constructor() {
    super({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused with a different request body',
      status: 409,
    })
  }
}
