/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AggregateApplicationStatus } from '../../database/aggregate-application.schema.js'

export type AggregateApplication = Readonly<{
  companyId: string
  createdAt: Date
  declaredData: Record<string, unknown>
  driverId: string | null
  duplicateDriverId: string | null
  email: string
  id: string
  latestSubmission: Record<string, unknown> | null
  name: string
  phone: string
  rejectionReason: string
  resubmittedAt: Date | null
  reviewedAt: Date | null
  status: AggregateApplicationStatus
  taxId: string
  updatedAt: Date
}>

export type AggregateApplicationSubmissionInput = Readonly<{
  companyId: string
  declaredData: Record<string, unknown>
  email: string
  name: string
  phone: string
  taxId: string
}>

export type AggregateApplicationRepositoryPort = Readonly<{
  approve: (input: {
    readonly driverId: string
    readonly id: string
  }) => Promise<AggregateApplication>
  createDriverAndApprove: (input: {
    readonly companyId: string
    readonly declaredData: Record<string, unknown>
    readonly email: string
    readonly id: string
    readonly name: string
    readonly phone: string
    readonly taxId: string
  }) => Promise<AggregateApplication>
  findById: (input: { readonly id: string }) => Promise<AggregateApplication | null>
  findDriverIdByTaxIdInCompanies: (input: {
    readonly companyIds: readonly string[]
    readonly taxId: string
  }) => Promise<string | null>
  findPendingByCompanyAndTaxId: (input: {
    readonly companyId: string
    readonly taxId: string
  }) => Promise<AggregateApplication | null>
  insert: (
    input: AggregateApplicationSubmissionInput & { readonly duplicateDriverId: string | null },
  ) => Promise<AggregateApplication>
  /**
   * Amarra os rascunhos de anexo à candidatura. O `where` é que faz a segurança: só rascunho **desta
   * empresa** e ainda **sem candidatura**. Identificador desconhecido, de outra empresa ou já
   * vinculado simplesmente não casa nenhuma linha — e nada disso muda a resposta, porque o submit é
   * `202` invariável e diferenciar aqui devolveria a sonda que o `202` fecha.
   */
  linkAttachmentDrafts: (input: {
    readonly applicationId: string
    readonly companyId: string
    readonly draftIds: readonly string[]
  }) => Promise<void>
  listByCompany: (input: { readonly companyId: string }) => Promise<readonly AggregateApplication[]>
  reject: (input: {
    readonly id: string
    readonly rejectionReason: string
  }) => Promise<AggregateApplication>
  updateResubmission: (input: {
    readonly declaredData: Record<string, unknown>
    readonly duplicateDriverId: string | null
    readonly email: string
    readonly id: string
    readonly name: string
    readonly phone: string
  }) => Promise<AggregateApplication>
}>
