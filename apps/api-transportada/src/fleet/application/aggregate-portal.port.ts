/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AggregateApplicationStatus } from '../../database/aggregate-application.schema.js'

export type AggregatePortalAccount = Readonly<{
  companyId: string
  taxId: string
}>

export type AggregatePortalApplication = Readonly<{
  rejectionReason: string
  status: AggregateApplicationStatus
}>

export type AggregatePortalDriverProfile = Readonly<{
  address: Readonly<{
    city: string
    complement: string
    district: string
    number: string
    postalCode: string
    state: string
    street: string
  }>
  email: string
  name: string
  phone: string
}>

export type AggregatePortalRepositoryPort = Readonly<{
  findAccountByUserId: (input: {
    readonly userId: string
  }) => Promise<AggregatePortalAccount | null>
  findApplication: (input: {
    readonly companyId: string
    readonly taxId: string
  }) => Promise<AggregatePortalApplication | null>
  findDriverProfile: (input: {
    readonly companyId: string
    readonly taxId: string
  }) => Promise<AggregatePortalDriverProfile | null>
}>
