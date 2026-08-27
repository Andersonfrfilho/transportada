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
