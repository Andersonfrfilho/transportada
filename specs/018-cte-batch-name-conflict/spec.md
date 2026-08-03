# Feature 018 — Conflito de nome de lote com resposta honesta

## Problema e resultado

Criar um segundo lote de CT-e no mesmo dia, com o mesmo número de notas, derruba a criação com **500
Internal Server Error** e a tela culpa a projeção fiscal, que não falhou.

Reproduzido ao vivo na stack local em 2026-07-30 (evidência em `evidence.md`): `POST /cte-batches`
com um nome de lote já existente responde `500`, e a exceção real é

```
PostgresError: duplicate key value violates unique constraint "cte_batches_company_id_name_unique"
errno: "23505"
```

A cadeia de três defeitos independentes:

1. **A violação de unicidade vaza como 500.** `createCteBatch` insere em `cte_batches` sem guardar a
   constraint `cte_batches_company_id_name_unique`. O `DrizzleQueryError` não é `ApiError`, então
   `createErrorResponse` devolve `INTERNAL_ERROR`. O repo já resolve isso em outros módulos —
   `drizzle-fleet-vehicle.repository.ts:130` embrulha a escrita em `runGuarded` e traduz a constraint
   pelo helper `violatedUniqueConstraint`; `cte-emission-profile.support.ts` faz o mesmo para o nome
   de perfil. O lote é a exceção que ficou de fora.
2. **A tela atribui à projeção uma falha da criação.** Em `useCteEmissionDialog.hook.ts:113-119` o
   `status` vira `'error'` tanto por `previewQuery.isError` quanto por `createMutation.isError`, e
   `CteEmissionDialog.component.tsx:144` só conhece um texto: `cteEmission.error` = "Não foi possível
   calcular a projeção. Tente novamente." Como `previewQuery.data` continua preenchido, o modal
   mostra a tabela de projeção correta **e** a mensagem de erro ao mesmo tempo — o operador lê que a
   projeção falhou enquanto olha para a projeção pronta.
3. **O erro do cliente perde o código.** `cteBatchClient.service.ts:111` transforma qualquer
   `!response.ok` em `CTE_BATCH_REQUEST_FAILED`, descartando o corpo. Mesmo que a API passe a
   responder `409` com código estável, o modal não teria como distinguir. O módulo vizinho já faz
   certo: `cteProfilesClient.service.ts:41-66` lê `payload.error.code` antes de lançar.

Some-se a isso que `http_request_failed` (`http/response.service.ts:30`) registra **apenas**
`correlationId` — sem nome da exceção, sem `sqlState`, sem constraint. Diagnosticar este 500 exigiu
instrumentar o handler à mão e reproduzir a requisição. Qualquer 500 futuro custará o mesmo.

**Resultado esperado:** nome de lote repetido responde `409` com código estável, o modal diz que o
nome já está em uso (e não que a projeção falhou), e um 500 passa a deixar rastro suficiente no log
para ser identificado sem instrumentação.

## Decisões tomadas

| Questão                                              | Decisão                                | Consequência                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gerar nome único automaticamente em vez de conflitar | Não                                    | O nome é do operador e aparece na fatura; renomear por baixo dos panos esconde que já existe um lote daquele dia. O conflito é informação útil.                                                                                                              |
| Onde traduzir a constraint                           | No repositório                         | É onde o repo já traduz constraint em erro de domínio (`fleet`, `cte-profiles`); a aplicação não deve conhecer nome de índice.                                                                                                                               |
| O que logar no 500                                   | `errorName`, `sqlState` e `constraint` | `error.message` de `DrizzleQueryError` carrega os **parâmetros** da query — inclusive nome de lote, ids e, em outras rotas, dado fiscal. Logar a mensagem crua violaria a regra de não logar dado sensível. `findPostgresError` já extrai só o que é seguro. |
| Status HTTP do conflito                              | `409`                                  | É o que `CteEmissionProfileNameTakenError` já usa para o caso gêmeo (nome de perfil repetido).                                                                                                                                                               |

## Fora do escopo

- Mudar o nome padrão sugerido pelo modal (`cteEmission.service.ts:153`,
  `CT-e <data> (<quantidade>)`). Ele **é** a causa da colisão frequente, mas trocar o padrão é decisão
  de produto sobre como o operador identifica um lote; a feature entrega o erro correto para qualquer
  nome escolhido. Registrado como pergunta aberta abaixo.
- Propagar código de erro em outros clients do frontend além de `cteBatchClient`.
- Rever a constraint `cte_batches_company_id_name_unique`. O nome único por empresa é intencional.
- Qualquer mudança em cálculo, projeção, regra de frete ou submissão.
- T009 da feature 014 continua bloqueada por `[NEEDS CLARIFICATION]`.

## Pergunta aberta (não bloqueia esta feature)

O nome padrão do modal repete a cada emissão do mesmo dia com a mesma contagem de notas, então o
operador **vai** encontrar o conflito quase sempre na segunda emissão do dia. Depois desta feature o
erro será claro e corrigível pelo próprio campo; se a intenção for evitar o atrito, o padrão precisa
de um discriminador (sequência do dia ou horário) — decisão de produto, feature própria.

## Histórias priorizadas

### P1 — Entender por que o lote não foi criado

**Given** que já existe um lote com o nome `CT-e 2026-07-30 (1)` na minha empresa
**When** eu confirmo a criação de outro lote com esse mesmo nome
**Then** a API responde `409` com o código `CTE_BATCH_NAME_TAKEN`, e o modal diz que já existe um lote
com esse nome — mantendo a projeção visível e o campo de nome editável, para eu corrigir e tentar de
novo sem reabrir a seleção.

### P2 — Não confundir falha de projeção com falha de criação

**Given** que a projeção foi calculada com sucesso
**When** a criação do lote falha por qualquer motivo
**Then** a mensagem é sobre a **criação**, nunca sobre a projeção; e quando é a projeção que falha, a
mensagem continua sendo a de projeção.

### P3 — Auditar um 500 sem instrumentar o servidor

**Given** um erro inesperado em qualquer rota
**When** eu leio o log da API
**Then** a linha `http_request_failed` traz `correlationId`, o nome da exceção e — quando a origem é o
Postgres — `sqlState` e a constraint violada, sem nenhum parâmetro de query, nome próprio, documento
ou XML.

## Critérios de aceite

1. `POST /cte-batches` com nome já usado na empresa responde `409` com
   `{ error: { code: 'CTE_BATCH_NAME_TAKEN', ... } }`; nenhum lote, item ou evento é gravado.
2. A tradução é feita no repositório, pelo helper `violatedUniqueConstraint`, e só para a constraint
   `cte_batches_company_id_name_unique` — qualquer outra violação continua subindo.
3. Nome repetido em **outra** empresa continua sendo criação válida (o conflito é por tenant).
4. `cteBatchClient` lança o `error.code` do envelope quando a resposta não é `ok`, caindo em
   `CTE_BATCH_REQUEST_FAILED` só quando não há código legível.
5. O modal distingue três situações com textos próprios de locale: falha ao calcular a projeção,
   nome de lote já em uso, e falha genérica ao criar o lote. Nenhum texto solto no componente.
6. Com a criação falhando, a tabela de projeção continua renderizada e o botão de confirmar volta a
   ficar disponível depois que o nome muda.
7. `http_request_failed` passa a logar `errorName` e, para erro de Postgres, `sqlState` e
   `constraint` — e nunca `error.message`, `error.stack` ou parâmetros de query. Provado por teste.
8. `make check` verde e verificação ao vivo na stack local, com evidência em `evidence.md`, sem CNPJ,
   IE, chave de acesso, razão social real ou nome de lote de tenant real.
