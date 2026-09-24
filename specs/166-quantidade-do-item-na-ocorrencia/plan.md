# Plano técnico

## Contexto e premissas

Mudança de ponta a ponta: banco, API e as duas telas (registro da ocorrência e cadastro de tipos).
A restrição que organiza tudo é a ordem de publicação da spec: **frontend tolerante primeiro**,
API depois, UI por último.

## Arquitetura e arquivos afetados

**Banco** (`apps/api-transportada/src/database/trip.schema.ts` + migration gerada)

- `trip_document_occurrence_products`: `quantity numeric(12,3)`, `quantity_unit varchar(8)`, CHECK
  de presença casada (`(quantity is null) = (quantity_unit is null)`), CHECK `quantity > 0` e CHECK
  do domínio da unidade (`unit`/`box` — VARCHAR, nunca ENUM nativo, §8 do code-standart).
- `company_occurrence_types`: `allows_multiple_items boolean not null default true`.

**API**

- `trips/presentation/occurrence.schema.ts` — parse das quantidades no multipart, alinhadas por
  índice a `productCodes`; `400` em divergência de tamanho, unidade desconhecida ou número ≤ 0.
- `trips/domain/occurrence-item-quantity.policy.ts` (novo) — política pura do par
  quantidade/unidade e do alinhamento das listas. É onde o contrato prova as regras sem HTTP.
- `trips/application/register-trip-occurrence.use-case.ts` — recebe os itens com quantidade, recusa
  mais de um item quando o tipo não permite (`422 OCCURRENCE_TYPE_SINGLE_ITEM`).
- `trips/infrastructure/drizzle-occurrence-product.repository.ts` — grava as duas colunas.
- Leitura da ocorrência (`trip.routes.ts` e as queries de ocorrência) — publica `products`.
- `save-occurrence-type.use-case.ts` + schema do cadastro — o interruptor novo.

**Frontend**

- `trip/shared/trip.constant.ts` — `products` entra em `TRIP_OCCURRENCE_OPTIONAL_KEYS` (Fase 1).
- `trip/shared/tripResponse.validation.ts` — guard de `products` tolerante.
- `trip/components/TripOccurrences.component.tsx` — campo de quantidade por item marcado e seletor
  de unidade; seleção única quando o tipo não aceita vários.
- `trip/shared/tripClient.service.ts` — manda as quantidades junto.
- Cadastro de tipos (`TripOccurrenceNotifications.component.tsx`) — o interruptor.

## Contratos/API/eventos

`POST /trips/:id/documents/:documentId/occurrences` (multipart) ganha dois campos repetidos,
alinhados a `productCodes`: `productQuantities` e `productQuantityUnits`. Vazio na posição é item
sem contagem. Resposta ganha `products: [{ code, quantity, unit }]` — `productCodes` permanece.

## Dados, migration e rollback

Aditiva: duas colunas anuláveis e uma com padrão. Rollback é `drop column` das três; nenhum dado
existente é reescrito. `make migration-test` é o gate (CA01).

⚠️ Numeração da migration colide com outras sessões — conferir contra `origin/staging` e rodar
`db:generate` até dar `no_changes` antes de publicar.

## Segurança e tenant

Tudo escopado por `companyId` do contexto. As chaves compostas de `trip_document_occurrence_products`
já carregam `company_id`; nada muda aí. Quantidade não é PII, mas também não entra em log.

## Idempotência e concorrência

Inalterado: o registro já é idempotente por `Idempotency-Key`, e a quantidade viaja no mesmo corpo.

## Observabilidade

Nada novo. O `422` de tipo de item único é código estável, contável no log de erro que já existe.

## Estratégia de testes

Contrato antes da implementação, em cada camada:

- Política pura (`test/trip-domain/occurrence-item-quantity.contract.ts`) — par casado, zero,
  negativo, unidade desconhecida, listas desalinhadas.
- Contrato da API — 400 e 422 da RF4/RF8, 201 gravando os dois campos, resposta com `products`.
- Integração — a linha do banco com os dois valores e com os dois nulos (os contratos não tocam o
  banco; sem a integração, a migration não foi exercitada).
- Frontend — validador aceitando resposta **com** e **sem** `products` (CA07), campo por item,
  seleção única.

⚠️ Teste novo entra na lista explícita do `package.json` da app e no entrypoint da suíte, ou não
roda.

## Riscos

- **A ordem de publicação.** Se a Fase 2 subir antes de a Fase 1 estar no ar, a tela quebra do jeito
  que quebrou hoje. A fase 1 é um commit próprio, publicado e confirmado em staging antes da 2.
- **Unidade sem conversão.** Caixa e peça convivem sem fator de conversão; qualquer soma futura
  precisa decidir isso, e esta spec não decide.
- **Bundle em cache.** O PWA segura a versão antiga; a confirmação em staging exige recarga forçada.
