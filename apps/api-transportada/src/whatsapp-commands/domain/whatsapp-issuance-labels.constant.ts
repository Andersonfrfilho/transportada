/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * pt-BR dos motivos que a volumetria do WhatsApp imprime. O operador nunca lê código: motivo sem
 * rótulo cai em `ISSUANCE_UNKNOWN_REASON_LABEL`, e o painel continua sendo onde se vê o detalhe.
 * Os textos seguem os da tela de Notas (`nfeWorkspace.locale.json`) e da NFS-e
 * (`nfseInvoice.locale.json`), para os dois canais contarem a mesma história.
 */
import type { EmissionProfileNoMatchReason } from '../../cte-profiles/domain/emission-profile-resolution.policy.js'

export const ISSUANCE_BLOCK_REASON_LABELS: Readonly<Record<string, string>> = {
  CTE_BATCH_DOCUMENT_ALREADY_LINKED: 'Já vinculada a outro CT-e',
  CTE_BATCH_DOCUMENT_DUPLICATED: 'Repetida na seleção',
  CTE_BATCH_DOCUMENT_LINKED_TO_NFSE: 'Já vinculada a uma nota de serviço',
  CTE_BATCH_DOCUMENT_MISSING_MUNICIPALITY: 'Sem código de município',
  CTE_BATCH_DOCUMENT_MISSING_PARTY: 'Sem emitente ou destinatário',
  CTE_BATCH_DOCUMENT_MISSING_TOTAL: 'Sem valor total',
  CTE_BATCH_DOCUMENT_MISSING_WEIGHT: 'Sem peso da carga',
  CTE_BATCH_DOCUMENT_MUNICIPAL_SERVICE: 'Serviço dentro do mesmo município',
  CTE_BATCH_DOCUMENT_NOT_AUTHORIZED: 'Nota não autorizada',
  CTE_BATCH_DOCUMENT_NOT_FOUND: 'Nota não encontrada',
  CTE_BATCH_DOCUMENT_OUTPUT_NFSE: 'O perfil manda esta nota para NFS-e',
  CTE_BATCH_DOCUMENT_SUMMARY_ONLY: 'Somente resumo, sem XML completo',
  CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE: 'O perfil de NFS-e apontado não está ativo',
  CTE_PROFILE_RULE_NOT_IN_FORCE: 'Sem regra de frete vigente',
  NFSE_CREDENTIAL_MISSING: 'Sem credencial da Nota RP ativa',
  NFSE_DOCUMENT_ALREADY_LINKED: 'Já está em outra nota de serviço',
  NFSE_DOCUMENT_DUPLICATED: 'Repetida na seleção',
  NFSE_DOCUMENT_LINKED_TO_CTE_BATCH: 'Já está em um lote de CT-e',
  NFSE_DOCUMENT_MISSING_TAKER_ADDRESS: 'Sem o endereço completo do tomador',
  NFSE_DOCUMENT_MISSING_TAKER_NAME: 'Sem a razão social do tomador',
  NFSE_DOCUMENT_NOT_FOUND: 'Nota não encontrada',
  NFSE_EMISSION_PROFILE_NOT_ACTIVE: 'O perfil de NFS-e não está ativo',
  NFSE_FISCAL_SETTINGS_MISSING: 'Dados fiscais da empresa não cadastrados (Nota RP)',
  NFSE_FREIGHT_RULE_VERSION_MISSING: 'A regra de frete da NFS-e não tem versão publicada',
}

export const ISSUANCE_UNKNOWN_REASON_LABEL = 'Outro motivo — confira no painel'

/**
 * Perfil `manual` nunca classifica (D3): a nota que só ele alcançaria aparece aqui como "nenhum
 * perfil casa", e a frase diz isso, senão o operador procura um defeito que é regra.
 */
export const ISSUANCE_NO_PROFILE_LABELS: Readonly<Record<EmissionProfileNoMatchReason, string>> = {
  ambiguous: 'Dois perfis casam com a mesma prioridade — desempate no painel',
  not_cnpj: 'Emitente ou destinatário sem CNPJ (pessoa física)',
  unmatched: 'Nenhum perfil automático casa com a nota (perfil manual só se usa pelo painel)',
}
