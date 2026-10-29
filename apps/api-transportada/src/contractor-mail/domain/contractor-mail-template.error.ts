/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T402: erros dos modelos de e-mail. Modelo de outra empresa recebe a mesma resposta de
 * modelo inexistente — nunca revelar que o id existe em outro tenant.
 */
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { DiagnosableError } from '../../shared/diagnosable.error.js'
import type { MailTemplateFieldError } from './mail-template-render.policy.js'

export class ContractorMailTemplateNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_TEMPLATE_NOT_FOUND',
      message: 'Contractor mail template was not found',
      status: 404,
    })
  }
}

/** Único `(company_id, mail_type, lower(name))` entre os ativos. */
export class ContractorMailTemplateNameTakenError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_TEMPLATE_NAME_TAKEN',
      details: [{ field: 'name', message: 'already used by an active template of this type' }],
      message: 'Contractor mail template name is already taken',
      status: 409,
    })
  }
}

/** Concorrência otimista, como `CONTRACTOR_MAIL_SETTINGS_VERSION_CONFLICT`: reler antes de tentar. */
export class ContractorMailTemplateVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_TEMPLATE_VERSION_CONFLICT',
      message: 'Contractor mail template version conflict',
      status: 409,
    })
  }
}

/** RF15: arquivado não volta, não é editado e não vira padrão — a mensagem enviada aponta para ele. */
export class ContractorMailTemplateArchivedError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_TEMPLATE_ARCHIVED',
      message: 'Contractor mail template is archived',
      status: 409,
    })
  }
}

/** RF14: variável desconhecida, de item fora do item, ou chave solta — o mesmo 400 do Zod. */
export class ContractorMailTemplateInvalidError extends ApiError {
  public constructor(errors: readonly MailTemplateFieldError[]) {
    super({
      ...HTTP_ERROR.invalidRequest,
      details: errors.map((error) => ({ field: error.field, message: error.message })),
    })
  }
}

/**
 * RF15: o `templateId` do envio precisa ser um modelo ativo do mesmo tipo, da empresa do token.
 * Inexistente, arquivado, de outro tipo ou de outra empresa recebem a mesma resposta.
 */
export class ContractorMailTemplateNotUsableError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE',
      details: [{ field: 'templateId', message: 'must be an active template of this mail type' }],
      message: 'The contractor mail template cannot be used for this message',
      status: 409,
    })
  }
}

/**
 * Segurança L2 (revisão final da Fase 4): teto de `CONTRACTOR_MAIL_TEMPLATE_MAX_ACTIVE` modelos
 * ativos por `(companyId, mailType)` — rede contra cadastro em loop, conferida no mesmo advisory
 * lock da criação (`acquireDefaultLock`), então duas criações concorrentes nunca furam o teto juntas.
 */
export class ContractorMailTemplateLimitReachedError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_TEMPLATE_LIMIT_REACHED',
      message: 'Contractor mail template active limit was reached for this type',
      status: 409,
    })
  }
}

/** `INSERT … RETURNING` vazio: nunca deveria acontecer; o motivo precisa chegar ao log. */
export class ContractorMailTemplateNotPersistedError extends DiagnosableError {
  public override readonly name = 'ContractorMailTemplateNotPersistedError'

  public constructor() {
    super('Contractor mail template was not persisted')
  }
}
