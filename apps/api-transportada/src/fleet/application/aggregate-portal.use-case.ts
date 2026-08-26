/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AggregateApplicationStatus } from '../../database/aggregate-application.schema.js'
import { AggregatePortalAccountNotLinkedError } from '../domain/aggregate-portal.error.js'
import type {
  AggregatePortalDriverProfile,
  AggregatePortalRepositoryPort,
} from './aggregate-portal.port.js'

export type AggregatePortalProfile = Readonly<{
  driver: AggregatePortalDriverProfile | null
  rejectionReason: string
  status: AggregateApplicationStatus | 'approved'
}>

type Dependencies = {
  readonly repository: AggregatePortalRepositoryPort
}

export type AggregatePortalUseCase = Readonly<{
  getProfile: (input: { readonly userId: string }) => Promise<AggregatePortalProfile>
}>

/**
 * `fleet_drivers` é a fonte da verdade pra "aprovado": uma candidatura aprovada sempre tem ficha
 * (T013 da 053), mas a ficha pode existir sem candidatura correspondente (cadastro manual pelo
 * operador). Por isso a ficha manda quando as duas existem — só cai pro status da candidatura
 * quando não há ficha ainda.
 */
export function createAggregatePortalUseCase(dependencies: Dependencies): AggregatePortalUseCase {
  return {
    async getProfile({ userId }) {
      const account = await dependencies.repository.findAccountByUserId({ userId })
      if (account === null) throw new AggregatePortalAccountNotLinkedError()

      const driver = await dependencies.repository.findDriverProfile({
        companyId: account.companyId,
        taxId: account.taxId,
      })
      if (driver !== null) return { driver, rejectionReason: '', status: 'approved' }

      const application = await dependencies.repository.findApplication({
        companyId: account.companyId,
        taxId: account.taxId,
      })
      if (application === null) throw new AggregatePortalAccountNotLinkedError()

      return {
        driver: null,
        rejectionReason: application.rejectionReason,
        status: application.status,
      }
    },
  }
}
