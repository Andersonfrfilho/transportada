# Plano técnico

## Contexto e premissas

Medido nesta sessão, com o EAN `7896098909768` (Tixan Primavera 1,6 kg):

| Provedor                       | Resposta                     | Dimensão de caixa master                           |
| ------------------------------ | ---------------------------- | -------------------------------------------------- |
| Bluesoft Cosmos                | `401 Token Inválido`         | sim (com token; free 25/dia)                       |
| GS1 Verified                   | não testado (exige cadastro) | sim (free 30/dia)                                  |
| Open Products Facts            | `200`, produto encontrado    | **não** — `packagings: []`, só `quantity: "1,6kg"` |
| OSCBR / gtin.rscsistemas       | `404 Rota nao encontrada`    | fora do ar                                         |
| api-produtos.seunegocionanuvem | `200` devolvendo HTML        | não é API                                          |
| Open Food Facts                | `404` (não é alimento)       | —                                                  |

Premissa central: **nenhuma fonte é confiável o bastante para gravar direto.** O próprio dado do
Cosmos para esse GTIN está com milímetro cadastrado como centímetro e grama como quilo. Toda a
arquitetura abaixo existe para transformar catálogo em _proposta auditável_, não em verdade.

A spec 155 (não commitada) mexe nas mesmas tabelas e no mesmo enum. Esta feature entra **depois**
dela, reaproveitando `replicated_from_box_id` e a fila por família.

## Arquitetura e arquivos afetados

Camada nova, na API (`apps/api-transportada`) e consumida pelo cron:

- `src/nfe-documents/application/package-box-catalog.port.ts` — `PackageBoxCatalogPort`:
  `lookup({ gtin }): Promise<CatalogLookupResult>`, com `provider`, `dimensions?`, `grossWeightGrams?`,
  `unitsPerBox?`, `rawPayload`.
- `src/nfe-documents/infrastructure/cosmos-package-box-catalog.gateway.ts`
- `src/nfe-documents/infrastructure/gs1-package-box-catalog.gateway.ts`
- `src/nfe-documents/infrastructure/open-products-facts-package-box-catalog.gateway.ts`
- `src/nfe-documents/infrastructure/cached-package-box-catalog.gateway.ts` — decorator de cache e
  cota, no molde de `fleet/infrastructure/cached-vehicle-catalog.gateway.ts`.
- `src/nfe-documents/domain/package-box-catalog-sanity.policy.ts` — função pura, os códigos do RF05.
- `src/nfe-documents/domain/package-box-catalog-consensus.policy.ts` — função pura, a regra do RF07.
- `src/nfe-documents/application/resolve-package-box-from-catalog.use-case.ts` — orquestra
  consulta → sanidade → consenso → proposta/promoção.
- `src/nfe-documents/infrastructure/drizzle-gtin-catalog-lookup.repository.ts`
- `apps/cron-transportada/src/package-box-catalog/…` — entrypoint one-shot diário.

O gateway do FIPE (`fleet/infrastructure/fipe-vehicle-catalog.gateway.ts`) e o par
`routing-matrix.port.ts` / `osrm-routing-matrix.gateway.ts` são o molde de porta+gateway já aceito
na base; nada de padrão novo.

## Contratos/API/eventos

- `GET /v1/package-boxes?measurementSource=catalog` — a fila já existe; ganha a origem no item.
- Sem rota nova de consulta ao catálogo. O conferente não dispara consulta externa (cota é escassa);
  quem consulta é o cron.
- Sem evento de fila nova: o cron é one-shot, lê e escreve direto.

## Dados, migration e rollback

Migration **aditiva**:

- Tabela `gtin_catalog_lookups` — `id`, `provider` (varchar, não ENUM nativo), `gtin` (varchar 14),
  `queried_at`, `outcome` (`found|not_found|rejected|invalid`), `rejection_code`, `length_mm`,
  `width_mm`, `height_mm`, `gross_weight_grams`, `units_per_box`, `raw_payload` (jsonb).
  Único em `(provider, gtin)`. **Sem `company_id`** — RNF01.
- Tabela `gtin_catalog_quota_usage` — `provider`, `usage_date`, `call_count`. Único em
  `(provider, usage_date)`.
- `nfe_package_box_measurements`: nada a acrescentar além do que a 155 já faz — `source` e `engine`
  já cabem `catalog` + nome do provedor.
- Enum de aplicação `PACKAGE_BOX_MEASUREMENT_SOURCES` ganha `'catalog'` (é varchar no banco,
  não ENUM nativo — sem migration de tipo).

Rollback: as duas tabelas novas são dropáveis sem perda de medida (cache reconstrói); o valor
`'catalog'` em `measurement_source` sobrevive como string. `make migration-test` fecha a task.

## Segurança e tenant

- `COSMOS_API_TOKEN` e `GS1_API_TOKEN` opcionais no schema de env; ausentes ⇒ provedor desligado.
- Token nunca em log; o logger já mascara header `authorization` — acrescentar `x-cosmos-token` à
  lista de headers redigidos.
- Nenhum dado pessoal sai daqui: o que vai para o provedor é um GTIN, dado de produto.
- `gtin_catalog_lookups` é global por desenho (RNF01); a leitura da caixa continua filtrando
  `company_id` do contexto autenticado.

## Idempotência e concorrência

- `(provider, gtin)` único torna a consulta idempotente: segunda passagem lê o cache.
- Promoção é `UPDATE … WHERE length_mm IS NULL` — perde de propósito para o conferente.
- Contador de cota incrementado na mesma transação da gravação do lookup; duas execuções
  concorrentes do cron não estouram a cota.

## Observabilidade

- Log por execução do cron: GTINs pendentes, consultados, aceitos, rejeitados por código, cota
  restante por provedor. Sem GTIN individual em nível `info`.
- Rejeição por sanidade sobe em `warn` com o código, sem o payload.

## Estratégia de testes

- Contrato (antes da implementação): sanidade e consenso são funções puras — o payload real do
  Cosmos vira fixture (`test/fixtures/gtin-catalog.fixture.ts`) e os CA01–CA04 são testes de função.
- Contrato: decorator de cache/cota com gateway falso, CA05 e CA06.
- Integração (`test/integration/`): cron completo contra Postgres real e gateways falsos, CA07.
  Roda com `bun --env-file=../../.env.test test --timeout 120000` — sem a flag, pula em silêncio.
- Arquivo de teste novo precisa entrar na lista explícita do `package.json` da app.

## Riscos

- **O catálogo está errado e a gente promove mesmo assim.** Mitigado pelo consenso de duas fontes +
  sanidade; mas duas fontes podem copiar o mesmo cadastro errado do fabricante. Por isso a promoção
  grava `measurement_margin_mm` e a medida continua substituível pelo conferente.
- **Cota de 25/dia é pouca.** Com ~643 caixas pendentes e ~11% com GTIN, a fila com chave é pequena
  o bastante para o cron varrer em poucos dias. Se a proporção de GTIN subir, a cota vira o gargalo
  e a conversa passa a ser plano pago — fora do escopo.
- **Open Products Facts sem dimensão** reduz o consenso a Cosmos×GS1 na prática; se o usuário só
  conseguir um dos dois, nada é promovido automaticamente e tudo vira proposta na fila. É um
  resultado aceitável, não uma falha.
- Conflito de numeração de migration com outras sessões: conferir `origin/staging` e exigir
  `db:generate` = `no_changes` antes do push.
