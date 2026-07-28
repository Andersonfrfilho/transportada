/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CteEmissionProfileDetail,
  CteEmissionProfilesUnitOfWorkPort,
} from '../../cte-profiles/application/cte-emission-profile.port.js'
import type { CteEmissionProfileCatalogPort } from '../application/cte-batch-preview.port.js'

const PAGE_SIZE = 100

export class DrizzleCteEmissionProfileCatalogRepository implements CteEmissionProfileCatalogPort {
  public constructor(private readonly unitOfWork: CteEmissionProfilesUnitOfWorkPort) {}

  public listProfiles({
    companyId,
  }: {
    readonly companyId: string
  }): Promise<readonly CteEmissionProfileDetail[]> {
    return this.unitOfWork.execute(async (transaction) => {
      const profiles: CteEmissionProfileDetail[] = []
      let cursor: string | null = null

      do {
        const page = await transaction.listProfiles({ companyId, cursor, limit: PAGE_SIZE })
        profiles.push(...page.items)
        cursor = page.nextCursor
      } while (cursor !== null)

      return profiles
    })
  }
}
