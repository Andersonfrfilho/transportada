/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Atributos que o produto grava no usuário do Keycloak. São lidos na reconciliação e escritos no
 * convite, na edição de perfil e no backfill — quatro lugares, então o nome vive num só.
 *
 * ⚠️ `TAX_ID` guarda o CPF **em claro** no realm, por decisão registrada em `docs/SECURITY.md`.
 * Ele existe para a reconciliação casar a mesma pessoa dos dois lados: a pessoa tem um documento
 * só e pode ter vários e-mails, então sem ele o casamento cai no e-mail e fica ambíguo.
 */
export const IDENTITY_USER_ATTRIBUTE = {
  COMPANY_ID: 'company_id',
  TAX_ID: 'tax_id',
} as const
