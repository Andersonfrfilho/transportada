/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { FINDING_SEVERITY, resolveAddressFinding } from '../domain/address-finding.policy.js'
import type {
  AddressFinding,
  AddressFindingGroup,
  AddressReport,
  AddressReportRepository,
} from './address-report.port.js'

/**
 * O relatório de endereços a corrigir (spec 084, G8).
 *
 * ⚠️ **O denominador viaja junto.** "24 endereços a corrigir" sozinho parece uma base podre; "24 de
 * 148 medidos" diz que o cadastro está majoritariamente bom e que estas vinte e quatro são o que
 * sobra. Publicar o numerador sem o denominador é a diferença entre um pedido e uma acusação.
 */
export type ReadAddressReportUseCase = Readonly<{
  read: (input: { readonly companyId: string }) => Promise<AddressReport>
}>

export function createReadAddressReportUseCase(dependencies: {
  readonly repository: AddressReportRepository
}): ReadAddressReportUseCase {
  return {
    async read(input) {
      const source = await dependencies.repository.read(input)

      const findings: AddressFinding[] = []
      for (const row of source.measurements) {
        const kind = resolveAddressFinding(row)
        if (kind !== null) findings.push({ ...row, kind })
      }
      /**
       * ADR-0062: a linha que a rotina paga tentou e não conseguiu apontar **não passa pelo
       * classificador** — não há medição para classificar, e o achado é o próprio fato de não haver.
       * Mandá-la para `resolveAddressFinding` a devolveria como `street_unknown`, que é outra coisa:
       * ali o provedor conhece o município e não a rua; aqui ele não pôs a carga em lugar nenhum.
       */
      for (const row of source.unresolved) {
        findings.push({ ...row, kind: 'coordinate_unresolved' })
      }

      return {
        groups: groupByContractor(findings),
        totals: {
          measured: source.measurements.length + source.unresolved.length,
          needingAttention: findings.length,
        },
      }
    },
  }
}

function groupByContractor(findings: readonly AddressFinding[]): readonly AddressFindingGroup[] {
  const byTaxId = new Map<string, AddressFinding[]>()
  for (const finding of findings) {
    const current = byTaxId.get(finding.contractorTaxId)
    if (current === undefined) byTaxId.set(finding.contractorTaxId, [finding])
    else current.push(finding)
  }

  return (
    [...byTaxId.values()]
      .map((group) => ({
        contractorName: group[0]?.contractorName ?? '',
        contractorTaxId: group[0]?.contractorTaxId ?? '',
        findings: [...group].sort(bySeverity),
      }))
      /**
       * Quem tem o pedido mais grave primeiro; empate desempata por quantidade. Ordenar só por
       * quantidade poria no topo o contratante com dez cadastros curtos, que é o achado mais brando.
       */
      .sort((left, right) => {
        const severity =
          FINDING_SEVERITY[left.findings[0]?.kind ?? 'street_incomplete'] -
          FINDING_SEVERITY[right.findings[0]?.kind ?? 'street_incomplete']

        return severity !== 0 ? severity : right.findings.length - left.findings.length
      })
  )
}

function bySeverity(left: AddressFinding, right: AddressFinding): number {
  const severity = FINDING_SEVERITY[left.kind] - FINDING_SEVERITY[right.kind]
  if (severity !== 0) return severity

  /** Dentro do mesmo pedido, o endereço mais distante primeiro: é onde o caminhão erra mais. */
  return (right.distanceMetres ?? 0) - (left.distanceMetres ?? 0)
}
