/* Copyright (c) 2026 Ada Technology. MIT License. */
export const COMPANY_USERS_PATH = '/company-users'
export const USERS_MANAGE_PERMISSION = 'users.manage'
export const COMPANY_USERS_PAGE_SIZE = 50

export const COMPANY_USER_ERROR = {
  FORBIDDEN: 'COMPANY_USERS_FORBIDDEN',
  REQUEST_FAILED: 'COMPANY_USERS_REQUEST_FAILED',
  RESPONSE_INVALID: 'COMPANY_USERS_RESPONSE_INVALID',
} as const

/** Cópia por valor do catálogo da API: o bundle não carrega código de lá. */
export const COMPANY_ROLES = [
  'company-admin',
  'finance',
  'fiscal',
  'operator',
  'viewer',
  'driver',
  'aggregate',
  'separator',
] as const

export const COMPANY_USER_STATUSES = ['invited', 'active', 'suspended'] as const

/** O convite não é estado que a tela escolhe: só ativo e suspenso atravessam a rota de status. */
export const COMPANY_USER_API_STATUSES = ['active', 'suspended'] as const

export const CONTACT_CHANNELS = ['email', 'sms', 'whatsapp'] as const

export const CPF_LENGTH = 11

/** Mesmo padrão do `updateCompanyUserProfileSchema` da API — o 400 dela não diz qual campo caiu. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,59}$/u

/** Códigos que a API devolve com 404/409 e que a tela ancora no campo em vez de num aviso solto. */
export const COMPANY_USER_API_ERROR = {
  CONTACT_TAKEN: 'COMPANY_USER_CONTACT_TAKEN',
  TAX_ID_TAKEN: 'COMPANY_USER_TAX_ID_TAKEN',
  NOT_FOUND: 'COMPANY_USER_NOT_FOUND',
  SELF_REMOVAL: 'SELF_MEMBERSHIP_REMOVAL',
  SUBJECT_NOT_FOUND: 'IDENTITY_SUBJECT_NOT_FOUND',
  USERNAME_TAKEN: 'USERNAME_ALREADY_TAKEN',
} as const
