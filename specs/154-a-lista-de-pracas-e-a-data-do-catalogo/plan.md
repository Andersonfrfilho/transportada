# Plano — 154

## Forma dos dados

```ts
// src/toll-booths/domain/toll-booth-extract.policy.ts  (puro)
type TollBoothExtractRecord = {
  dataset: string // 'sudeste' — o mesmo do OSRM_PBF_URL
  observedOn: string // Last-Modified do .pbf, AAAA-MM-DD
  objectKey: string // toll-booths/osm/<dataset>/<observedOn>/toll-booths.json
  sha256: string
  boothCount: number
  boothsWithCharge: number
  boothsWithAxleCharge: number
  uploadedByUserId: string
  reloadedAt: Date | null
  reloadedByUserId: string | null
  reloadedBoothCount: number | null
}
```

`buildExtractObjectKey({ dataset, observedOn })` é a única fonte da chave — a string do caminho
aparece em três lugares (upload, recarga, runbook) e vira constante, nunca literal repetido.

## Banco

1. **Migration aditiva** `toll_booth_extracts`: PK `bigserial` (contexto interno, code-standart §8),
   `UNIQUE (dataset, observed_on)`, `varchar` nos textos (ENUM nativo é proibido), `sha256` fixo de
   64, contagens `integer`, `uploaded_by_user_id uuid NOT NULL`, `reloaded_*` nulos. **Sem
   `company_id`** (D10). `rollback.sql` junto, `make migration-test`.
2. `test/fleet-schema/tenant-safety.contract.ts` passa de quatro para cinco tabelas sem
   `company_id`, com a justificativa no próprio contrato.

## API (`apps/api-transportada`)

3. **`src/toll-booths/presentation/`** nasce aqui — o módulo não tinha camada HTTP. Três rotas:
   - `GET /v1/toll-booths` (`fleet.read`) — catálogo paginado com valor efetivo da empresa do
     contexto, `seen`, `catalogKnown`, e o resumo do RF2.
   - `GET`/`POST /v1/toll-booths/extracts` (`settings.manage`).
   - `POST /v1/toll-booths/reload` (`settings.manage`).
4. **A consulta do catálogo** é um `LEFT JOIN` de `toll_booths` com `company_toll_booth_charges` da
   empresa do contexto, mais o conjunto de `osm_node_id` já vistos. ⚠️ **A resolução do valor
   efetivo continua na política** (`resolveEffectiveTollBoothCharge`), nunca no SQL — é a mesma
   regra que a spec 086 fixou e que `crew-zone-wiring.contract.ts` existe para proteger.
5. **`list-toll-booth-charges.use-case.ts` não é apagado nem reescrito de assunto:** ele continua
   sendo a lista das praças vistas, e passa a ser um filtro (`onlySeen=true`) da consulta nova. A
   rota antiga de `company-settings` permanece — é a que a tela usa hoje e o que a spec 095 afirma.
6. **Upload do extrato**: valida o JSON com Zod (é entrada externa), calcula sha256, grava no bucket
   em `create-only`, registra a linha. Objeto já existente → 409, sem sobrescrever.
7. **Recarga**: lê a linha, baixa o objeto, valida, chama `createSeedTollBoothsUseCase` (que já
   existe e é idempotente), grava `reloaded_*`. Concorrência: `SELECT … FOR UPDATE` na linha do
   extrato — duas recargas simultâneas serializam em vez de se sobrepor (RNF3).
8. **Erros**: classe própria estendendo o `DomainError` do módulo — extrato desconhecido, objeto
   ausente, extrato duplicado. Nunca `AppError` cru.

## Frontend (`apps/frontend-transportada`)

9. `TollBoothChargePanel` passa a consumir a lista do catálogo: campo de busca (debounce), paginação
   e cabeçalho com `boothCount`, `observedOn` e `status`. As linhas em si **não mudam** — o
   componente de linha já faz o que a feature pede.
10. Bloco de recarga, só com `settings.manage`: seletor de extrato (RF3), botão, e o resultado
    (quantas gravadas, de quando). Sem extrato registrado → frase própria apontando o runbook.
11. `RouteTollSummary`: a praça sem tarifa conhecida ganha ação que leva ao ajuste dela. Sem
    `settings.manage`, a ação não é renderizada.
12. Locales nos quatro dicionários — `valuation-gap-labels.contract.ts` já cobra dicionário completo
    para o que a API produz; o mesmo rigor vale aqui.

## Documentação

13. `docs/runbooks/osrm-extract.md`: a subida do extrato passa a ser pela tela (RF3b), a recarga pelo
    botão, e o registro das contagens medidas vira o que a tabela guarda.
14. `apps/api-transportada/CLAUDE.md` e `docs/ai-context/` — regra §14 do code-standart: rota nova
    exige atualizar o contexto.

## Ordem e risco

A Fase 1 (dados) é pré-requisito de tudo. A Fase 2 (catálogo em leitura) entrega sozinha o aceite 1
e pode ir para staging sem a Fase 3. A Fase 3 (extrato e recarga) é a que toca bucket e é a única com
efeito sobre todas as empresas da instalação. A Fase 4 (viagem) é independente das Fases 2 e 3.
