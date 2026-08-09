/* Copyright (c) 2026 Ada Technology. MIT License. */
export const SYNTHETIC_BOOTSTRAP_TOKEN = 'synthetic-bootstrap-token'

export const BOOTSTRAP_ADMINISTRATOR_INPUT = {
  email: 'admin@example.test',
  firstName: 'Ana',
  lastName: 'Fiscal',
  password: 'synthetic-pass-1',
  username: 'ana.fiscal',
} as const

export const BOOTSTRAP_FIRST_ADMIN_RESPONSE = {
  data: {
    companyId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91',
    subject: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e92',
    userId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93',
  },
} as const

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
