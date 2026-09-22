# Feature 162 — Importar para produção as medidas de caixa coletadas

## Problema e resultado

A captura assistida (`scripts/box-catalog-harvest/`, spec 161) grava num JSONL local o que leu na
tabela de embalagens do Cosmos (`found`) ou num site alternativo (`found_manual`). Nada disso chega
a `nfe_package_boxes`: a CHECK de `source`/`measurement_source` não aceita `'catalog'` e não existe
ator de sistema para `measured_by_user_id`.

Resultado: **um comando, rodado por uma pessoa, lê o JSONL, aplica a sanidade da spec 160 e grava
em produção proposta (fila do conferente) ou medida, sem nunca tocar medida humana.**

A fonte do JSONL não é assunto desta spec. Ela só consome o arquivo, qualquer que seja a coleta
(captura assistida hoje; arquivo licenciado da Bluesoft ou API amanhã, no mesmo formato).

## Fora do escopo

- Coleta de dados (spec 161). Nada aqui navega, raspa ou chama o Cosmos.
- Sobrescrever medida existente (RF08 da 160).
- Lastro/camada como coluna nova — ficam só no JSONL até existir spec de paletização.

## Histórias

### P1 — Medida lida vira proposta na fila

**Given** uma linha `found`/`found_manual` com 3 arestas e a caixa correspondente com `length_mm IS NULL`
**When** o importador roda com `--apply`
**Then** nasce `nfe_package_box_measurements` com `source='catalog'`, `engine='cosmos'` ou
`'manual:<domínio>'`, `proposed_*_mm` preenchidos, e a caixa aparece na fila com a proposta.

### P2 — Dado torto não entra

**Given** a linha com medida que falha `evaluatePackageBoxCatalogSanity` (ex.: 474 × 240 × 247 cm)
**When** o importador avalia
**Then** nada é gravado para essa caixa e o relatório lista o GTIN com o código de rejeição.

### P3 — Medida humana é intocável

**Given** a caixa já medida entre a coleta e a importação
**When** o importador tenta gravar
**Then** o `UPDATE`/`INSERT` é condicional a `length_mm IS NULL`, não altera nada e conta como `skipped_measured`.

### P4 — Simulação antes de gravar

**Given** o comando sem `--apply`
**Then** roda tudo em transação que sofre `ROLLBACK`, e imprime o relatório: quantas propostas,
promoções, rejeições (por código) e caixas puladas.

### P5 — Um GTIN, várias caixas

**Given** o mesmo GTIN em caixas de empresas diferentes
**Then** cada caixa recebe a proposta dentro da sua `company_id`; nenhuma linha cruza empresa.

## Requisitos funcionais

- RF01 — Migration aditiva: alarga `nfe_package_box_measurements_source_check` e
  `nfe_package_boxes_measurement_source_check` para incluir `'catalog'`, com `rollback.sql`.
- RF02 — Ator de sistema: constante UUID fixa `CATALOG_IMPORT_ACTOR_ID` em
  `package-box-catalog.constant.ts`, usada em `measured_by_user_id` (seguir o padrão de
  `system-distribution-actor.constant.ts` do cron). Se `measured_by_user_id` tiver FK para usuário,
  a migration cria o registro do ator — **conferir antes** e registrar no `plan.md`.
- RF03 — Parser do JSONL (schema zod) → `PackageBoxCatalogCandidate`: vírgula decimal, cm→mm e
  kg→g **só pela unidade declarada**, inteiros arredondados. Linha inválida é relatada, não derruba o lote.
- RF04 — Sanidade: `evaluatePackageBoxCatalogSanity` (spec 160, Fase 1) em toda linha.
- RF05 — Fonte única → **proposta** (P1). Promoção direta para `nfe_package_boxes` só com consenso
  de duas fontes (`evaluatePackageBoxCatalogConsensus`), ex.: `found` do Cosmos + `found_manual`
  concordando. Promoção grava `measurement_source='catalog'`, `measured_at=now()`.
- RF06 — Casamento linha → caixa por `carton_gtin` = `cartonGtin` da linha, só caixas com
  `length_mm IS NULL`.
- RF07 — Idempotência: rodar duas vezes o mesmo JSONL não duplica proposta (não inserir se já houver
  medição `source='catalog'` com o mesmo `engine` e as mesmas arestas para a caixa).
- RF08 — CLI `apps/api-transportada/src/cli/import-package-box-catalog.ts`, entra na imagem da API;
  lê o JSONL do stdin; flags `--apply` (padrão: simulação). Relatório em JSON no stdout.
- RF09 — Script local `scripts/box-catalog-harvest/import-to-production.sh`: envia o JSONL local
  (base64) por `railway ssh --service api --environment production` e roda a CLI. Sem `--apply`
  por padrão; com `--apply` pede confirmação digitada (`IMPORTAR`).

## Requisitos não funcionais

- RNF01 — Tudo numa transação por execução; erro no meio → nada gravado.
- RNF02 — Log sem PII; só GTIN, `companyId` opaco e contagens.
- RNF03 — Sem proxy público do Postgres; a execução é dentro do serviço `api`.

## Critérios de aceite

- CA01 — Contrato: parser converte `"47,4" cm` → 474 mm e `"15,0" kg` → 15000 g; unidade ausente → linha rejeitada `UNIT_MISSING`.
- CA02 — Contrato: fixture torta da 160 rejeitada por `EDGE_TOO_LARGE`, nada gravado.
- CA03 — Integração: caixa com medida não muda em nenhum caminho (P3).
- CA04 — Integração: simulação não deixa linha no banco (P4).
- CA05 — Integração: mesmo JSONL duas vezes = mesmas contagens, zero duplicata (RF07).
- CA06 — Integração: duas empresas com o mesmo GTIN recebem cada uma a sua proposta (P5).
- CA07 — `make migration-test` verde (migration + rollback).

## Dúvidas

Nenhuma bloqueante. RF02 tem uma checagem de código (FK de `measured_by_user_id`) antes da T003.
