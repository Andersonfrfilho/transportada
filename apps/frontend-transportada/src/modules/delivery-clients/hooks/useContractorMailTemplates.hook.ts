/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getContractorMailTemplatesClient } from '../shared/contractorMailTemplatesClient.service'
import type {
  ContractorMailTemplateCreateBody,
  ContractorMailTemplateUpdateBody,
  MailTemplatePreviewSource,
} from '../shared/contractorMailTemplatesClient.service'
import type { ContractorMailTemplateType } from '../shared/contractorMailTemplates.types'

const MAIL_TEMPLATES_CATALOG_QUERY_KEY = 'contractor-mail-templates-catalog'
const MAIL_TEMPLATES_LIST_QUERY_KEY = 'contractor-mail-templates-list'

/**
 * Spec 150 T403: catálogo (tipos, variáveis, modelo sugerido) e a lista de modelos do tipo ativo na
 * tela. Toda mutação invalida a lista — não há atualização otimista: o `version` que volta do
 * servidor é o que a próxima edição precisa citar.
 */
export function useContractorMailTemplates(
  input: Readonly<{ enabled: boolean; mailType: ContractorMailTemplateType | undefined }>,
) {
  const queryClient = useQueryClient()
  const client = getContractorMailTemplatesClient()
  const listKey = [MAIL_TEMPLATES_LIST_QUERY_KEY, input.mailType] as const

  const catalogQuery = useQuery({
    enabled: input.enabled,
    queryFn: () => client.getCatalog(),
    queryKey: [MAIL_TEMPLATES_CATALOG_QUERY_KEY],
  })

  /** `mailType` chega pronto do chamador (catálogo já resolvido) — nada de escolher aqui dentro. */
  const templatesQuery = useQuery({
    enabled: input.enabled && input.mailType !== undefined,
    queryFn: () => client.listTemplates(input.mailType as ContractorMailTemplateType),
    queryKey: listKey,
  })

  function invalidateList(): void {
    void queryClient.invalidateQueries({ queryKey: listKey })
  }

  const createMutation = useMutation({
    mutationFn: (body: ContractorMailTemplateCreateBody) => client.createTemplate(body),
    onSuccess: invalidateList,
  })

  const updateMutation = useMutation({
    mutationFn: (input: Readonly<{ body: ContractorMailTemplateUpdateBody; templateId: string }>) =>
      client.updateTemplate(input),
    onSuccess: invalidateList,
  })

  const setDefaultMutation = useMutation({
    mutationFn: (input: Readonly<{ templateId: string; version: string }>) =>
      client.setDefault(input),
    onSuccess: invalidateList,
  })

  const previewMutation = useMutation({
    mutationFn: (source: MailTemplatePreviewSource) => client.preview(source),
  })

  return {
    catalogQuery,
    createMutation,
    previewMutation,
    setDefaultMutation,
    templatesQuery,
    updateMutation,
  }
}
