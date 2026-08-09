/* Copyright (c) 2026 Ada Technology. MIT License. */
export type BootstrapAdministratorInput = Readonly<{
  email: string
  firstName: string
  lastName: string
  password: string
  username: string
}>

export type BootstrapFirstAdminResult = Readonly<{
  companyId: string
  subject: string
  userId: string
}>

export type BootstrapFirstAdminResponse = Readonly<{
  data: BootstrapFirstAdminResult
}>
