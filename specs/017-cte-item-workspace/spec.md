# Feature 017 — Área de trabalho de CT-es em `/cte-batches`

## Problema e resultado

Hoje `/cte-batches` lista **lotes**, não CT-es. A tabela tem seis colunas (`name`, `status`,
`itemCount`, `createdAt`, `updatedAt`, `version`), nenhuma delas com dinheiro, número fiscal ou número
de nota; o `CteBatchSummary` devolvido por `GET /cte-batches` não carrega nenhum valor. Os CT-es só
aparecem depois de abrir um lote, através de `GET /cte-batches/:id/items` — uma leitura **de um lote
só**, sem filtro e sem paginação, que devolve o array inteiro.

Disso decorre tudo o que falta na tela:

1. **Não há filtro de CT-e.** O painel de filtros do lote tem cinco campos (nome, faixa de data de
   criação, faixa de contagem de itens) e chips de status **de lote**. Não existe faixa de número de
   CT-e nem de número de nota, que é como o operador procura um documento.
2. **Os controles ocupam a tela.** O painel de filtros e o menu de colunas (`CteBatchColumnsMenu`)
   ficam renderizados inline, sempre abertos — diferente da tabela de notas, onde os dois abrem por
   botão de ícone na barra da tabela.
3. **CT-e concluído polui a fila.** Todo item já resolvido continua na lista com o mesmo peso visual
   de um item que ainda exige ação.
4. **A seleção não informa nada.** Marcar linhas não diz quantos CT-es estão marcados nem quanto
   somam — e a soma é justamente o que o operador precisa para conferir um lote calculado por
   percentual sobre o valor da nota antes de submeter.
5. **Não há paginação.** A lista cresce indefinidamente; a tabela de notas já pagina.

**Resultado esperado:** `/cte-batches` passa a ter uma tabela de **CT-es** do tenant, com as colunas
que importam (número fiscal, lote, notas vinculadas, data, base, frete, status), filtros por faixa de
data, faixa de número de CT-e e faixa de número de nota, filtros e organização de colunas recolhidos
em botão como na tela de notas, CT-es concluídos escondidos por padrão, paginação, e uma barra de
seleção que mostra **quantos CT-es estão selecionados e quanto somam**.

## Decisões tomadas com o solicitante

| Pergunta                              | Resposta                                                                                                            | Consequência                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Granularidade da tabela               | "continuar listando a ctes mas, pegar os valores, das que eu seleciono e somar"                                     | A linha é o CT-e (item de lote), não o lote. O lote vira coluna e filtro.                                                      |
| O que é "concluído" e some por padrão | "ctes que ja enviamos para sefaz ou seja ctes emitidas, não apenas criadas"                                         | O filtro de status nasce sem os estados resolvidos; um CT-e apenas criado (`pending`) continua visível.                        |
| Qual valor somar                      | "hoje em um dos parametros selecionaveis é 4.5% sobre o valor da nota … vc vai ir somando o total que selecionamos" | Soma o **valor do frete calculado** do CT-e (`totalAmount`), e ao lado a base (`baseAmount`) que o originou, para conferência. |

### Suposição declarada: quais status somem por padrão

"Enviado para a SEFAZ" abrange estados que **exigem ação** (`rejected`, `reconciliation_required`) e
estados **resolvidos** (`authorized`, `cancelled`). Esconder um CT-e rejeitado apagaria trabalho
pendente da fila do operador. Portanto o filtro padrão esconde apenas:

- `authorized` — autorizado pela SEFAZ, nada mais a fazer;
- `cancelled` — cancelado, encerrado;
- `in_flight` — em trânsito, aguardando resposta, sem ação possível.

E mantém visíveis `pending`, `retry_scheduled`, `failed`, `rejected` e `reconciliation_required`. Os
chips de status revelam qualquer um deles, e a preferência do usuário é persistida como as demais
(feature 015). Se a intenção era esconder também os rejeitados, é a mudança de uma constante.

## Fora do escopo

- Agregar a soma no servidor. A soma é do que o operador **seleciona**, e a seleção é do cliente;
  somar no navegador com decimal escalado dá o mesmo resultado sem endpoint novo.
- Alterar `GET /cte-batches/:id/items`. Continua servindo a tela de um lote específico.
- Somar valor fiscal (`fiscalAmount`) na barra de seleção. Fica na coluna, mas o total pedido é o do
  frete.
- Mudar cálculo, regra de frete, submissão ou qualquer coisa do fluxo de emissão. Esta feature é
  leitura, filtro e apresentação.
- T009 da feature 014 (valor de frete manual) continua bloqueada por `[NEEDS CLARIFICATION]`.

## Histórias priorizadas

### P1 — Ver os CT-es que ainda exigem ação

**Given** que a minha empresa tem CT-es autorizados, pendentes e rejeitados
**When** eu abro `/cte-batches`
**Then** a tabela lista os CT-es pendentes, rejeitados e em falha, e **não** lista os autorizados,
cancelados ou em trânsito — e um chip de status revela cada um desses quando eu quiser.

### P2 — Achar um CT-e pela faixa de número

**Given** que eu sei o intervalo de numeração do CT-e ou o intervalo de número das notas
**When** eu abro o painel de filtros pelo botão da barra da tabela e informo mínimo e máximo
**Then** a lista traz só os CT-es cujo número fiscal está na faixa, ou que têm ao menos uma nota
vinculada com número na faixa, combinando com o filtro de data.

### P3 — Conferir o total do que eu selecionei

**Given** um lote calculado por percentual sobre o valor da nota
**When** eu marco linhas da tabela
**Then** a barra de seleção mostra a **quantidade de CT-es selecionados**, a soma do **frete** e a
soma da **base**, em centavos exatos — inclusive quando as linhas selecionadas vêm de páginas
diferentes.

### P4 — Trabalhar com a tabela sem perder a tela

**Given** uma lista longa de CT-es
**When** eu navego pela tabela
**Then** os filtros e a organização de colunas abrem por botão de ícone (como na tabela de notas), a
lista pagina com tamanho de página escolhido por mim, e ordenação, filtros, colunas e tamanho de
página sobrevivem ao recarregamento.

## Critérios de aceite

1. `GET /cte-batch-items` devolve os CT-es do tenant autenticado, paginados por cursor
   (`page.nextCursor`), aceitando `limit` (padrão 25, máximo 100), `batchId`,
   `issuedFrom`/`issuedUntil`, `cteNumberGte`/`cteNumberLte`, `invoiceNumberGte`/`invoiceNumberLte` e
   `statusIn` multi-valor — no mesmo padrão sufixado de `parseCteBatchList`.
2. Faixa invertida, `limit` fora do intervalo, cursor corrompido, status desconhecido, chave repetida,
   chave fora da allowlist e `batchId` não-UUID respondem `400`, antes de tocar o caso de uso.
3. Nenhuma leitura da listagem alcança linha de outra empresa: todo filtro carrega
   `company_id = $` — provado por teste de isolamento sobre as funções de filtro.
4. A tabela do frontend expõe seleção por linha e no cabeçalho, ordenação por cabeçalho, filtro
   simples e avançado, chips de status multi-valor, "limpar filtros", zebra striping, reordenação e
   visibilidade de colunas persistidas — o contrato de `docs/frontend/data-tables.md`.
5. O filtro de status nasce sem `authorized`, `cancelled` e `in_flight`.
6. A barra de seleção mostra contagem e somas calculadas em inteiro escalado — nunca `Number` sobre
   valor monetário — e cobre seleção acumulada entre páginas.
7. Os campos de filtro usam as métricas de `docs/frontend/fields.md` e todo select é o
   `@/components/ui/select`; os contratos de design system continuam verdes.
8. `make check` verde; verificação ao vivo na stack local com evidência em `evidence.md`, sem CNPJ,
   IE, chave de acesso ou razão social real.
