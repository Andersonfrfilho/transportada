# Feature 157 — Tipos de ocorrência por etapa

Origem: achados L6 da spec 156 (`specs/156-o-escritorio-da-baixa-pelo-motorista/evidence.md`,
"Achados anteriores à spec").

## Problema e resultado

1. O PWA do motorista lista os tipos de ocorrência por `GET /company-settings/occurrence-types`, que
   exige `settings.manage`. O motorista não tem essa permissão, recebe 403, e o seletor de
   ocorrência aparece vazio sem aviso — ele não consegue registrar ocorrência nenhuma.
2. `POST /trips/:id/documents/:documentId/occurrences` (galpão, `trip.manage`) aceita tipo de
   etapa `delivery`. Quem só separa carga (`separator`) registraria "recusa total" sem ter estado
   na rua — o que `occurrence.policy.ts` diz impedir, mas a guarda nunca foi ligada à rota.

Resultado: o motorista vê os tipos de rua da empresa, e a rota do galpão só grava tipo de galpão.

## Fora do escopo

- ~~Aviso visual quando a lista de tipos falha~~ — entrou como RF5/T4.
- Abrir `GET /company-settings/occurrence-types` a outros papéis — ela carrega os modelos de e-mail.

## Histórias priorizadas

### P1 — O motorista escolhe o tipo de ocorrência

**Given** um motorista com viagem ativa e tipos de rua cadastrados **When** ele abre o registro de
ocorrência **Then** vê os tipos ativos de etapa `delivery`, só com `id` e `name`.

### P1 — O galpão não grava ocorrência de rua

**Given** alguém com `trip.manage` **When** envia um tipo de etapa `delivery` para a rota do galpão
**Then** recebe 422 `OCCURRENCE_TYPE_NOT_SEPARATION` e nada é gravado.

## Requisitos funcionais

- RF1. `GET /me/trips/current/occurrence-types`, permissão `trip.report`, na árvore `/me` (sem id
  de viagem), devolve `{ data: [{ id, name }] }` dos tipos ativos de `delivery` da empresa do token.
  Reaproveita `listFieldOccurrenceTypes` (a mesma projeção da L2 da spec 156).
- RF2. Conta sem cadastro de motorista recebe o mesmo `DRIVER_NOT_REGISTERED` das outras rotas `/me`.
- RF3. O PWA do motorista consome RF1 no lugar da rota de configuração.
- RF4. `registerTripOccurrence` (rota do galpão e fluxo WhatsApp do operador) recusa tipo cuja
  etapa não é `separation` com 422 `OCCURRENCE_TYPE_NOT_SEPARATION`, antes de gravar ou avisar.

- RF5. Quando a lista de tipos **falha** (rede, 4xx/5xx, corpo inválido), o painel "Registrar
  ocorrência" diz isso e oferece tentar de novo. Lista **vazia de verdade** (empresa sem tipo de rua
  ativo) tem texto próprio. Nos dois casos, entregar, devolver e "Deu problema" seguem funcionando —
  a falha nunca vira erro de tela nem bloqueia a parada.

## Regra confirmada (RF4)

Os dois chamadores de `registerTripOccurrence` já oferecem só `separation`: a tela do escritório
(`TripOccurrences.component.tsx`) e o fluxo WhatsApp do operador
(`register-operator-trip-flow-actions.ts`). A ocorrência de rua tem rota própria para o motorista
(`/me/.../occurrences`) e para o escritório em nome dele (`POST /trips/:id/documents/field-occurrences`,
`trip.report-on-behalf`). A regra do produto é, portanto, a do comentário de `occurrence.policy.ts`
e de `occurrence.constant.ts` do frontend: a permissão sai do tipo. O servidor só passa a garantir.

## Critérios de aceite

- CA1. Contrato: a rota RF1 existe sob `/me/trips/current`, pede `trip.report`, e o papel `driver`
  a alcança.
- CA2. Contrato: o handler devolve só `id`/`name` de rua e ativos, com o `companyId` do contexto.
- CA3. Contrato: tipo `delivery` no caso de uso do galpão lança `OccurrenceTypeNotSeparationError`
  (422) e não chama `saveOccurrence` nem o notificador.
- CA4. Contrato do frontend: o cliente do motorista chama `/me/trips/current/occurrence-types`.

- CA5. Contrato do frontend: o cliente distingue falha de lista vazia (hoje ambas viram `[]` e o
  `.catch(() => undefined)` de `DriverTripWorkspace.page.tsx` engole o erro); o painel mostra o
  aviso de falha com "Tentar de novo", e o texto de lista vazia quando não há tipo; smoke com o
  dublê de `/me/trips/current/occurrence-types` respondendo 500 e depois 200.

## Dúvidas

Nenhuma.
