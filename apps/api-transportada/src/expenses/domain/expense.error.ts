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
