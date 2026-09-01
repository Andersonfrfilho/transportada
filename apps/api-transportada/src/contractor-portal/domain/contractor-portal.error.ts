/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * ADR-0050 §2: a conta com o papel existe, mas nenhum documento foi amarrado a ela. É 403 e não 404:
 * o recurso existe — o que falta é o vínculo, e quem o cria é a transportadora.
 *
 * A alternativa, devolver lista vazia, faria o portal parecer funcionando e a pessoa concluir que
 * não tem entrega nenhuma. Configuração pela metade tem de doer no dia em que é feita.
 */
export class ContractorNotBoundError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_NOT_BOUND',
      message: 'This account is not bound to any contractor document',
      status: 403,
    })
  }
}

/**
 * ADR-0050 §2: o vínculo é do papel `contractor`. Amarrar a conta de um operador a um contratante
 * não daria acesso nenhum — `deliveries.track` não está no papel dele —, e é justamente isso que faz
 * o erro valer a pena: quem tentou acreditaria ter concedido acesso, e ninguém descobriria até o
 * cliente ligar dizendo que não entra.
 */
export class ContractorPortalRoleRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_PORTAL_ROLE_REQUIRED',
      details: [{ field: 'membershipId', message: 'contractor' }],
      message: 'Only a membership with the contractor role can be bound',
      status: 409,
    })
  }
}

/** Vínculo que não existe nesta empresa responde como vínculo que nunca existiu. */
export class ContractorPortalBindingNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_PORTAL_BINDING_NOT_FOUND',
      message: 'Portal binding was not found',
      status: 404,
    })
  }
}

/**
 * Chave que não é de nota dele, nota que não existe e nota que ainda não entrou em viagem respondem
 * igual: distinguir "não é sua" de "não existe" já é informação, e é a informação que transforma o
 * portal em oráculo de chave de acesso.
 */
export class ContractorDeliveryNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_DELIVERY_NOT_FOUND',
      message: 'Delivery was not found',
      status: 404,
    })
  }
}

/** Lote de outro contratante responde como lote inexistente: existir já é informação. */
export class ContractorBatchNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'EXTRA_CHARGE_BATCH_NOT_FOUND',
      message: 'Extra charge batch was not found',
      status: 404,
    })
  }
}
