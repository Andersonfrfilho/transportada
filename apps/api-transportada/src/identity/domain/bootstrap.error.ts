/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

export type BootstrapUnavailableReason =
  | 'ALREADY_PROVISIONED'
  | 'COMPANY_MISSING'
  | 'TOKEN_MISMATCH'
  | 'TOKEN_NOT_CONFIGURED'

/**
 * Toda recusa do primeiro acesso responde o mesmo 404 uniforme (ADR-0022) — a razão
 * nunca escapa para o corpo da resposta, só serve para a trilha de auditoria interna.
 */
export class BootstrapUnavailableError extends ApiError {
  public readonly reason: BootstrapUnavailableReason

  public constructor(reason: BootstrapUnavailableReason) {
    super(HTTP_ERROR.notFound)
    this.name = 'BootstrapUnavailableError'
    this.reason = reason
  }
}
