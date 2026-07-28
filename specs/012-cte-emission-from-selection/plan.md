# Plano — Feature 012

## Decisões de arquitetura

**D1 — Payload montado na API, não no worker.** A API tem todos os repositórios (notas,
participantes, volumes, perfil fiscal, cálculo de frete). Montar lá e persistir em
`cte_issuance_payloads` torna o payload auditável e congelado, e reduz o worker a
transporte. Resolve de uma vez o `createCteIssuanceExecutionInputResolver` que hoje retorna
`null` e o `toProviderConfig` que manda 10 campos obrigatórios como string vazia.

**D2 — Perfil de emissão é módulo próprio, regra de frete é reaproveitada.**
`freight_rules`/`freight_rule_versions` já têm versionamento, vigência, piso/teto e snapshot
imutável, e `freight_calculations` já é pré-requisito do lote. O perfil referencia a regra
do **componente principal**; a UI apresenta um formulário único e a API escreve nas duas
estruturas na mesma transação. `freight_rule_versions.filters` (hoje sempre `{}`) passa a
guardar `{ senderTaxIds, destinationStates }`, e as exceções por UF viram regras de
prioridade maior com o mesmo mecanismo — sem tabela nova para isso.

**D2a — Componentes adicionais são dados, não código.** GRIS, ad valorem, pedágio, despacho
e TDA não ganham tipo próprio: são linhas de `cte_emission_profile_components` com
`calculationType` ∈ `percentage_of_cargo | percentage_of_freight | fixed_amount`. A UI só
oferece presets que pré-preenchem o formulário. O resultado por CT-e é congelado em
`cte_batch_item_charges`, que alimenta tanto o `<Comp>` do XML quanto o `billing` — sem
recálculo em nenhum dos dois lados.

**D2b — Ordem de cálculo.** `percentage_of_cargo` incide sobre `vCarga`;
`percentage_of_freight` incide sobre o componente principal **já ajustado** por piso/teto;
`fixed_amount` entra por último. Piso e teto se aplicam ao componente principal, não ao
total — do contrário um GRIS alto mascararia o frete mínimo.

**D3 — Um item de lote = um CT-e.** Para suportar agrupamento, nasce
`cte_batch_item_documents` (N notas por item), com unique `(company_id, batch_id,
nfe_document_id)` garantindo que a mesma nota não entre duas vezes no lote.
`cte_batch_items.nfe_document_id` permanece como documento primário (o de maior valor do
grupo) para não quebrar as FKs compostas e o código existente.

**D4 — Montagem do CT-e é domínio puro.** `cte-payload.builder.ts` em
`src/cte-issuance/domain/`, sem I/O, recebe tudo pronto e devolve `CteData`. É o coração
fiscal — testado como golden fixture contra o XML de referência.

**D5 — Dinheiro.** Todo o cálculo em `BigInt`/`numeric(19,4)` como já é hoje. A conversão
para `number` acontece só no adaptador do provider, com half-up para 2 casas, e o valor
convertido é conferido contra o decimal antes de enviar.

## Camadas afetadas

### `apps/api-transportada`

| Módulo                 | Mudança                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `cte-profiles/` (novo) | domain (resolução por CNPJ + prioridade), application (CRUD + ativação), infrastructure (repo Drizzle), presentation (rotas + Zod) |
| `cte-batches/`         | corrige multi-documento, adiciona `preview`, resolve perfil, garante cálculo de frete, `GET /:id/items`                            |
| `cte-issuance/`        | monta e persiste payload no `issue`, injeta `listDocuments`, respeita `:itemId`, usa série/ambiente reais                          |
| `freight/`             | expõe `update`/`activate`/`deactivate` que já existem no use case mas não têm rota                                                 |
| `nfe-documents/`       | adiciona CNPJ das partes e município IBGE ao item de listagem                                                                      |
| `database/`            | `cte-emission-profile.schema.ts`, `cte-issuance-payload.schema.ts`, alterações em `cte-batch.schema.ts`                            |

### `apps/worker-transportada`

Resolver passa a ler `cte_issuance_payloads`; gateway recebe config completa; novo
repositório de write-back (attempts, fiscal documents, eventos, transição do lote); XML
autorizado vai para o MinIO. ⚠️ As cópias de schema no worker
(`src/database/cte-issuance-execution.schema.ts`) precisam acompanhar.

### `apps/frontend-transportada`

Nova página `/cte-profiles`; ação _Gerar CT-es_ + diálogo de prévia na `selectionBar` de
Notas (`NfeDocumentTable.component.tsx:672`); página de CT-es reescrita com tabela de lotes,
drill-in de itens e ações; o módulo `cte-issuance` — que hoje tem client e hook prontos e
**zero UI** — finalmente ganha tela.

### `adatechnology-packages` (outro repositório)

`CteXmlBuilder`: parametrizar `retira` e `indIEToma`, emitir `vCargaAverb` e `dPrev`.
Requer autorização explícita antes de tocar.

## Ordem de execução

Fase A (parametrização) → Fase B (seleção → lote) → Fase C (emissão real). Cada fase
entrega valor sozinha: A dá o cadastro, B dá o CT-e pronto para transmitir, C fecha o ciclo.

## Riscos

- **Credenciamento CT-e em homologação** é pré-requisito externo do critério de aceite 4.
- **Ajuste no pacote fiscal** está fora deste repo e pode atrasar a paridade com o XML de
  referência.
- **Numeração fiscal** é o ponto mais sensível: reserva já existe, mas o caminho de falha
  (número reservado e emissão não concluída) precisa de teste dedicado.
- **Agrupamento** muda `infCarga` — soma de pesos e volumes e escolha do produto
  predominante — e é onde mais provavelmente aparecem rejeições de schema.
