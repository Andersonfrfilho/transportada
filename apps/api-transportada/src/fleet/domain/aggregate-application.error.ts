/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export class AggregateApplicationNotFoundError extends Error {
  public constructor() {
    super('aggregate application not found')
    this.name = 'AggregateApplicationNotFoundError'
  }
}

export class AggregateApplicationAlreadyReviewedError extends Error {
  public constructor() {
    super('aggregate application was already approved or rejected')
    this.name = 'AggregateApplicationAlreadyReviewedError'
  }
}

export class AggregateApplicationOutsideGroupError extends Error {
  public constructor() {
    super('the chosen unit does not belong to the served company group')
    this.name = 'AggregateApplicationOutsideGroupError'
  }
}

export class AggregateApplicationRejectionReasonRequiredError extends Error {
  public constructor() {
    super('a rejection requires a reason')
    this.name = 'AggregateApplicationRejectionReasonRequiredError'
  }
}

/**
 * `fleet_drivers` só guarda condutor pessoa física (CPF) — o CNPJ do autônomo é o campo
 * `linked_tax_id` de uma ficha já existente, nunca a chave da ficha nova. Uma candidatura de
 * pessoa jurídica sem `duplicateDriverId` não tem para qual ficha vincular esse CNPJ sozinha, e
 * aprovar por aqui pararia no CHECK do banco em vez de numa mensagem que o operador entende.
 */
export class AggregateApplicationRequiresManualDriverCreationError extends Error {
  public constructor() {
    super('a legal-entity application without a matched driver needs manual driver creation')
    this.name = 'AggregateApplicationRequiresManualDriverCreationError'
  }
}
