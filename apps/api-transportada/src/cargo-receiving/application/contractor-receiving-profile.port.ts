/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ContractorReceivingProfile,
  ContractorReceivingProfileLookup,
  FindContractorReceivingProfileParams,
  SaveContractorReceivingProfileRecordParams,
} from './contractor-receiving-profile.types.js'

export type ContractorReceivingProfileRepositoryPort = {
  find(params: FindContractorReceivingProfileParams): Promise<ContractorReceivingProfileLookup>
  /**
   * Upsert idempotente, com a trilha em `audit_logs` na mesma transação e só quando algo mudou.
   * `null` é contratante fora da empresa.
   */
  save(
    params: SaveContractorReceivingProfileRecordParams,
  ): Promise<ContractorReceivingProfile | null>
}
