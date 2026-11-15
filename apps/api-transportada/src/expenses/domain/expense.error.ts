/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325: erros do módulo Contas, com código estável. Só existe o contrato; a T1.4 usa nos casos de uso.
 */
import { ApiError } from '../../shared/api.error.js'

/** RF1b: a categoria de motorista exige o motorista. */
export class ExpenseDriverRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_DRIVER_REQUIRED',
      message: 'This category requires a driver.',
      status: 400,
    })
  }
}

/** RF1b: as demais categorias não aceitam motorista. */
export class ExpenseDriverNotAllowedError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_DRIVER_NOT_ALLOWED',
      message: 'This category does not accept a driver.',
      status: 400,
    })
  }
}

/** CA05b/CA04: motorista inexistente ou de outra empresa (404, sem revelar existência). */
export class ExpenseDriverNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_DRIVER_NOT_FOUND',
      message: 'The driver is not registered in this company.',
      status: 404,
    })
  }
}

export class ExpenseCategoryNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_CATEGORY_NOT_FOUND',
      message: 'The category is not registered in this company.',
      status: 404,
    })
  }
}

/** ADR-0116 §1: o pagamento de motorista é `in_trip` e só ele; as demais categorias ficam num dos três grupos rateáveis. */
export class ExpenseCategoryCostGroupInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_CATEGORY_COST_GROUP_INVALID',
      message:
        'The driver payment category stays in the trip group, and no other category can join it.',
      status: 422,
    })
  }
}

export class ExpenseOccurrenceNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_OCCURRENCE_NOT_FOUND',
      message: 'The occurrence is not registered in this company.',
      status: 404,
    })
  }
}

/** Baixa duas vezes → 409. */
export class ExpenseOccurrenceAlreadyPaidError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_OCCURRENCE_ALREADY_PAID',
      message: 'The occurrence is already paid.',
      status: 409,
    })
  }
}

/** Baixa de ocorrência cancelada → 409. */
export class ExpenseOccurrenceCanceledError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_OCCURRENCE_CANCELED',
      message: 'The occurrence is canceled.',
      status: 409,
    })
  }
}

/** Baixa com valor ≤ 0 → 400. */
export class ExpenseInvalidPaidAmountError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_INVALID_PAID_AMOUNT',
      message: 'The paid amount must be greater than zero.',
      status: 400,
    })
  }
}

/** Conta fixa sem recorrência/dia, ou variável sem vencimento (ou com os dois jeitos misturados). → 400 */
export class ExpenseInvalidScheduleError extends ApiError {
  public constructor(message: string) {
    super({ code: 'EXPENSE_INVALID_SCHEDULE', message, status: 400 })
  }
}

export class ExpenseNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_NOT_FOUND',
      message: 'The expense is not registered in this company.',
      status: 404,
    })
  }
}

/** Cancelar duas vezes, ou cancelar o que já foi pago → 409. */
export class ExpenseOccurrenceNotCancelableError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_OCCURRENCE_NOT_CANCELABLE',
      message: 'Only an open occurrence can be canceled.',
      status: 409,
    })
  }
}

export class ExpenseCategoryNameTakenError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_CATEGORY_NAME_TAKEN',
      message: 'A category with this name already exists.',
      status: 409,
    })
  }
}

export class ExpenseInvalidAmountError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_INVALID_AMOUNT',
      message: 'The amount must be a non-negative value with up to two decimal places.',
      status: 400,
    })
  }
}

/** RF1d: só a ocorrência de uma conta com favorecido (motorista, agregado ou ajudante) recebe viagens. */
export class ExpenseOccurrenceNotDriverPaymentError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_OCCURRENCE_NOT_DRIVER_PAYMENT',
      message: 'Only a driver payment occurrence takes trips.',
      status: 409,
    })
  }
}

/** Viagem inexistente ou de outra empresa (404, sem revelar existência). */
export class ExpenseTripNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_TRIP_NOT_FOUND',
      message: 'The trip is not registered in this company.',
      status: 404,
    })
  }
}

/** CA05c: só viagem concluída entra no pagamento. */
export class ExpenseTripNotCompletedError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_TRIP_NOT_COMPLETED',
      message: 'Only a completed trip can be paid.',
      status: 409,
    })
  }
}

/** CA05c: a pessoa da conta não estava na tripulação da viagem no papel que este pagamento cobre. */
export class ExpenseTripNotPayeeError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_TRIP_NOT_PAYEE',
      message: 'The payee is not on this trip crew with a payable role.',
      status: 409,
    })
  }
}

/** CA05c: viagem sem a parcela calculada (lacuna) não entra; aparece como pendência. */
export class ExpenseTripParcelMissingError extends ApiError {
  public constructor(gap: string) {
    super({
      code: 'EXPENSE_TRIP_PARCEL_MISSING',
      details: [{ field: 'tripId', message: gap }],
      message: 'The trip has no calculated parcel for this payee.',
      status: 409,
    })
  }
}

/** CA05c: a parte da pessoa nesta viagem já está noutro pagamento. */
export class ExpenseTripAlreadyIncludedError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_TRIP_ALREADY_INCLUDED',
      message: 'The trip is already included in another payment.',
      status: 409,
    })
  }
}

/** Remover viagem que não está nesta ocorrência. */
export class ExpenseOccurrenceTripNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_OCCURRENCE_TRIP_NOT_FOUND',
      message: 'The trip is not included in this occurrence.',
      status: 404,
    })
  }
}

/** Spec 325 RF31: só o administrador desfaz a baixa por resposta. */
export class ExpenseReplyUndoForbiddenError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_REPLY_UNDO_FORBIDDEN',
      message: 'Only an administrator can undo a settlement made by reply.',
      status: 403,
    })
  }
}

/** Spec 325 RF31: passou das 24 horas. */
export class ExpenseReplyUndoExpiredError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_REPLY_UNDO_EXPIRED',
      message: 'The settlement made by reply can only be undone within 24 hours.',
      status: 409,
    })
  }
}

/** Spec 325 RF31: o motivo é obrigatório. */
export class ExpenseReplyUndoReasonRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_REPLY_UNDO_REASON_REQUIRED',
      message: 'A reason is required to undo the settlement.',
      status: 400,
    })
  }
}

/** Spec 325 RF5/RF31: baixa dada no painel é imutável; só a baixa por resposta tem desfazer. */
export class ExpenseReplyUndoNotReplyError extends ApiError {
  public constructor() {
    super({
      code: 'EXPENSE_REPLY_UNDO_NOT_REPLY',
      message: 'Only a settlement made by reply can be undone.',
      status: 409,
    })
  }
}
