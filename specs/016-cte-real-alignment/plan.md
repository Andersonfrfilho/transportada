# Plano técnico — Feature 016

## Contexto e premissas

- A comparação de `research.md` foi feita com o código atual, sem stub: `charge-composition.service`
  - `cte-payload.builder`. Nada do que já bate precisa mudar.
- `nfe_products` **já guarda** o que a regra nova precisa: `quantity` (`numeric(19,4)`, escala 4, a
  mesma de `MONEY_SCALE`) e `ordinal` (`bigint`, `> 0`). Não há migration em NF-e.
- A única migration é o `CHECK` de `cte_emission_profiles.predominant_product_mode`.
- `resolvePredominantProduct` já isola o modo; a extensão é aditiva.
- A leitura `findCteIssuancePayloadSource` hoje **não tem nenhum teste** — é onde o
  `sender_recipient` deixa de ser exercitado, e é onde entra o teste de isolamento de tenant.
- O `crt` já viaja de `companyFiscalProfiles.taxRegime` para `providerConfig`
  (`cte-issuance-payload.service.ts`), com contrato em `test/cte-issuance-application/payload.contract.ts:84`.
  A frente 3 é conferência de **dado**, não de código.

## Arquitetura e arquivos afetados

**Domínio (api)**

- `src/database/cte-emission-profile.schema.ts` — `CTE_PREDOMINANT_PRODUCT_MODES` ganha
  `'highest_quantity'`; o `CHECK` é derivado de `inList(...)`, então acompanha sozinho.
- `src/cte-issuance/domain/cte-payload.types.ts` — `CtePayloadProduct` ganha
  `readonly ordinal: number` e `readonly quantity: null | string`.
- `src/cte-issuance/domain/cte-cargo.service.ts` — `resolvePredominantProduct` passa a despachar três
  modos calculados; a comparação vira uma função de ordenação explícita
  (grandeza desc → `totalValue` desc → `ordinal` asc → posição da nota asc), substituindo o
  `resolveByHighest` "primeiro maior vence", que não expressa desempate. `highest_weight` deixa de
  ler só `product.grossWeight`: a grandeza passa por uma resolução de fonte de peso — item quando
  **todos** os produtos da seleção declaram, peso bruto do volume da nota caso contrário. O peso da
  nota reaproveita a mesma soma que `composeCargoQuantities` já faz.

**Infraestrutura (api)**

- `src/cte-issuance/infrastructure/cte-issuance-payload.query.ts` — `loadProducts` projeta
  `nfeProducts.quantity` e `nfeProducts.ordinal` (mantendo `order by documentId, ordinal`); para
  permitir o teste de tenant sem banco, os filtros de cada leitura são extraídos em funções
  exportadas `build*Filters`, no mesmo formato de
  `drizzle-cte-issuance.repository.ts:buildIssuedDocumentFilters`.

**Peso — o que muda e o que não muda**

| Uso                                                  | Fonte                                                               | Muda?                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| `infQ` / `pesoB` do CT-e (declaração legal da carga) | soma dos `nfe_volumes.gross_weight`                                 | **não** — `composeCargoQuantities` fica intacto |
| Escolha do produto predominante em `highest_weight`  | peso por item se todos declaram; senão peso bruto do volume da nota | **sim**                                         |

A NF-e não tem campo de peso por produto no layout — por isso `nfe_products` não tem a coluna e a
query grava `null`. `CtePayloadProduct.grossWeight` **permanece** no tipo como ponto de extensão: no
dia em que a importação passar a extrair peso por item de algum lugar, o domínio já o prefere sem
nenhuma outra mudança. E a soma dos itens nunca substitui o volume na declaração — o volume pesa a
embalagem e é o valor legal; um contrato prova exatamente isso.

**Borda (api)**

- `src/cte-profiles/presentation/cte-emission-profile-request.schema.ts` — `z.enum` deriva de
  `CTE_PREDOMINANT_PRODUCT_MODES`, então aceita o valor novo sem edição; a regra
  `fixed ⇔ predominantProductName` continua intacta. Confirmar por teste, não por leitura.

**Frontend**

- `src/modules/cte-profiles/shared/cteProfiles.types.ts` — `CTE_PROFILE_PREDOMINANT_PRODUCT_MODE`
  ganha `'highest_quantity'` (lista ordenada alfabeticamente, como as demais).
- `src/modules/cte-profiles/shared/cteProfilesGuards.validation.ts` — `PROFILE_ENUMS`
  acompanha; sem isso a resposta 200 com o valor novo é rejeitada pelo guard estrito.
- `src/modules/cte-profiles/locales/cteProfiles.locale.json` e `.en.locale.json` —
  `predominantProductOption.highest_quantity`: "Item de maior quantidade" / "Highest quantity item".
- `CteProfileFiscalFields.component.tsx` não muda: o seletor já itera a constante.

**Migration**

- `apps/api-transportada/drizzle/<ts>_cte_predominant_product_highest_quantity/` com
  `migration.sql` (`DROP CONSTRAINT` + `ADD CONSTRAINT` com a lista ampliada), `snapshot.json`
  gerado por `db:generate` e `rollback.sql` manual no formato do repo — cabeçalho de licença, aviso
  de "manual rollback only", `BEGIN/COMMIT`, remoção da linha de `drizzle.__drizzle_migrations` com
  `GET DIAGNOSTICS` exigindo exatamente 1.

## Contratos/API/eventos

- Nenhuma rota nova, nenhum evento novo, nenhuma versão de envelope alterada.
- `POST /v1/companies/:companyId/cte-emission-profiles` e o `PUT` correspondente passam a aceitar
  mais um valor no enum já existente — extensão compatível, sem quebra de contrato.
- `GET` devolve o valor gravado; o frontend precisa do guard atualizado **antes** de a API poder
  gravar o valor novo, senão um perfil válido derruba a tela (mesmo padrão de falha já registrado em
  `frontend-authme-permission-allowlist-drift`). Ordem das tasks respeita isso.

## Dados, migration e rollback

```sql
-- migration
ALTER TABLE "cte_emission_profiles"
  DROP CONSTRAINT "cte_emission_profiles_predominant_product_mode_check",
  ADD CONSTRAINT "cte_emission_profiles_predominant_product_mode_check"
  CHECK ("predominant_product_mode" in ('highest_value', 'highest_weight', 'highest_quantity', 'fixed'));
```

O rollback devolve a lista de três valores. **É destrutivo por omissão:** qualquer perfil já gravado
com `highest_quantity` faz o `ALTER` falhar — de propósito. O `rollback.sql` diz isso e não converte
nada em silêncio; a decisão sobre esses perfis é humana.

Nenhuma coluna nova, nenhum backfill, nenhum `DEFAULT` alterado — perfis existentes seguem em
`highest_value`.

## Segurança e tenant

- `companyId` continua vindo do contexto autenticado; o modo é atributo de perfil, e perfil é por
  empresa.
- A mudança em `cte-issuance-payload.query.ts` mexe em query: **teste de isolamento obrigatório**,
  provando `company_id = $` em cada uma das leituras da fonte de payload.
- Nada do que a regra nova lê (`quantity`, `ordinal`, descrição) é dado sensível; ainda assim
  descrição de produto não vai para log.

## Idempotência e concorrência

Inalteradas. O modo entra no perfil, o perfil é congelado no `calculationSnapshot` do item do lote no
momento da criação, e o payload é montado a partir desse snapshot — trocar o modo do perfil não
reescreve lote já criado. O `payloadSha256` muda apenas para lotes novos, que é o comportamento
correto de idempotência por tentativa.

## Observabilidade

Sem métrica nova. O modo escolhido já viaja no `calculationSnapshot` persistido, que é a trilha
auditável de qual regra produziu qual `proPred`.

## Estratégia de testes

Ordem obrigatória: contrato falhando → implementação → contrato verde → evidência.

| Alvo                                                    | Arquivo                                                                              | Registro                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Regra `highest_quantity` e desempates                   | `test/cte-issuance-domain/predominant-product.contract.ts` (novo)                    | importado por `test/cte-issuance-domain.contract.test.ts`, já listado no `package.json`         |
| Fonte de peso do `highest_weight` e peso legal da carga | mesmo arquivo (novo) + `cte-payload-builder.contract.ts`                             | mesma cadeia                                                                                    |
| `CHECK` da migration aceita o modo                      | `test/cte-profiles-schema/profiles.contract.ts` (existente)                          | já listado                                                                                      |
| Fonte de payload agrupada + tenant                      | `test/cte-issuance-infrastructure/payload-source.contract.ts` (novo)                 | importado por `test/cte-issuance-infrastructure.contract.test.ts`, já listado no `package.json` |
| Payload de N notas (builder)                            | `test/cte-issuance-domain/cte-payload-builder.contract.ts` (existente, ampliar)      | já listado                                                                                      |
| Enum na borda HTTP                                      | `test/cte-profiles-http/create.contract.ts` (existente)                              | já listado                                                                                      |
| Formulário e guard                                      | `test/cte-profiles/api-payload.contract.ts` + `cte-profiles.fixture.ts` (existentes) | já listado                                                                                      |
| CRT do emitente                                         | `test/cte-issuance-application/payload.contract.ts` (existente)                      | já listado                                                                                      |

Regra do repo aplicada: **arquivo de teste novo só roda se estiver na cadeia explícita** — entrypoint
no `test` do `package.json` da app, suíte no `import` do entrypoint. Toda task que cria arquivo prova
na evidência que ele apareceu na saída do `bun test`.

Fixtures das amostras: cinco formas numéricas anonimizadas, uma por desempate —
`(qCom, vProd, nItem)` de 14093, 14094, 14108, 14123 e 14139 com descrições genéricas e chaves
sintéticas. O caso 14139 entra como teste **da regra**, com comentário de uma linha dizendo que o
real diverge; não como teste do XML real.

Gates: `bun run lint` · `bun run typecheck` · `bun run --cwd apps/api-transportada test` ·
`bun run --cwd apps/frontend-transportada test` · `make migration-test` · `make check`.

## Riscos

| Risco                                                                                              | Mitigação                                                                                                             |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Guard do frontend rejeitar o valor novo e apagar a tela de perfis                                  | frontend (types + guard + locale) entra **antes** de a API aceitar gravar                                             |
| `highest_weight` lança erro em toda emissão real (`loadProducts` grava `grossWeight: null` sempre) | corrigido nesta feature: cai para o peso bruto do volume, que é o que a NF-e declara (decisão do usuário, 2026-07-29) |
| Alguém somar peso de itens para declarar `pesoB` e mudar a carga do XML                            | contrato explícito provando que `infQ` segue o volume mesmo quando a soma dos itens diverge                           |
| Fonte de peso misturada (parte dos itens com peso, parte sem) produzindo escolha arbitrária        | regra do tudo-ou-nada: fonte por item só vale se **todos** os produtos da seleção declaram peso                       |
| Empate resolvido por ordem de banco (não determinístico)                                           | o desempate é explícito até `ordinal`, e o teste cobre empate triplo (caso 14123)                                     |
| `quantity` lida como `Number` em algum ponto do caminho                                            | comparação inteira via `parseScaledDecimal` na escala 4, igual ao resto do motor                                      |
| Migration aplicada em ambiente com rollback pendente                                               | `make migration-test` no Postgres descartável antes de qualquer aplicação; rollback nunca roda no startup             |
| `taxRegime` local divergente do CRT do CNPJ, produzindo grupo ICMS errado                          | conferência com evidência antes de qualquer emissão nova; correção pela tela de configurações fiscais                 |
