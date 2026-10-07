/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ContractorReceivingProfile,
  ContractorReceivingProfileLookup,
  ContractorReceivingProfilePage,
  FindContractorReceivingProfileParams,
  ListContractorReceivingProfilesRecordParams,
  SaveContractorReceivingProfileRecordParams,
} from './contractor-receiving-profile.types.js'

export type ContractorReceivingProfileRepositoryPort = {
  find(params: FindContractorReceivingProfileParams): Promise<ContractorReceivingProfileLookup>
  /** Uma consulta pela empresa do contexto, em ordem de id do contratante. */
  list(params: ListContractorReceivingProfilesRecordParams): Promise<ContractorReceivingProfilePage>
  /**
   * Upsert idempotente, com a trilha em `audit_logs` na mesma transação e só quando algo mudou.
   * `null` é contratante fora da empresa.
   */
  save(
    params: SaveContractorReceivingProfileRecordParams,
  ): Promise<ContractorReceivingProfile | null>
}
