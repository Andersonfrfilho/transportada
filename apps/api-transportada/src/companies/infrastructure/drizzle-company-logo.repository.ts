/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq } from 'drizzle-orm'

import { companyLogos } from '../../database/database.schema.js'
import type {
  CompanyLogo,
  CompanyLogoMetadata,
  CompanyLogoRepositoryPort,
  SaveCompanyLogoInput,
} from '../application/company-logo.port.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'

export class DrizzleCompanyLogoRepository implements CompanyLogoRepositoryPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async find(input: { readonly companyId: string }): Promise<CompanyLogo | null> {
    const [row] = await this.database
      .select({
        byteSize: companyLogos.byteSize,
        contentBase64: companyLogos.contentBase64,
        mimeType: companyLogos.mimeType,
        sha256: companyLogos.sha256,
        updatedAt: companyLogos.updatedAt,
      })
      .from(companyLogos)
      .where(eq(companyLogos.companyId, input.companyId))
      .limit(1)
    if (row === undefined) return null

    return {
      byteSize: row.byteSize,
      bytes: Buffer.from(row.contentBase64, 'base64'),
      mimeType: row.mimeType,
      sha256: row.sha256,
      updatedAt: row.updatedAt,
    }
  }

  public async remove(input: { readonly companyId: string }): Promise<boolean> {
    const removed = await this.database
      .delete(companyLogos)
      .where(eq(companyLogos.companyId, input.companyId))
      .returning({ companyId: companyLogos.companyId })
    return removed.length > 0
  }

  public async save(input: SaveCompanyLogoInput): Promise<CompanyLogoMetadata> {
    const [row] = await this.database
      .insert(companyLogos)
      .values({
        byteSize: input.byteSize,
        companyId: input.companyId,
        contentBase64: input.contentBase64,
        mimeType: input.mimeType,
        sha256: input.sha256,
      })
      .onConflictDoUpdate({
        set: {
          byteSize: input.byteSize,
          contentBase64: input.contentBase64,
          mimeType: input.mimeType,
          sha256: input.sha256,
          updatedAt: new Date(),
        },
        target: companyLogos.companyId,
      })
      .returning({
        byteSize: companyLogos.byteSize,
        mimeType: companyLogos.mimeType,
        sha256: companyLogos.sha256,
        updatedAt: companyLogos.updatedAt,
      })
    if (row === undefined) throw new Error('Company logo row was not returned by the database')

    return row
  }
}
