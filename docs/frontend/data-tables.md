# Padrão de tabelas com muitas informações (data tables)

Regra de projeto **obrigatória** para toda tela do frontend que renderize dados
tabulares densos (listagens, grids, relatórios). Consolidada a partir da tabela
"Notas" do módulo `nfe-workspace`; toda tabela nova ou existente que carregue
muitas colunas/registros deve seguir este contrato. Divergência exige ADR em
`docs/adr/`.

Referências vivas — leia o código antes de inventar tabela nova:

| Referência            | Módulo          | O que ela demonstra                                                                              |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| Tabela "Notas"        | `nfe-workspace` | O contrato base: filtro simples + avançado (grupos E/OU), colunas persistidas, filtro no cliente |
| Tabela de CT-es (§ 7) | `cte-batch`     | Paginação por cursor, soma decimal da seleção entre páginas, status escondido por padrão         |

## 1. Capacidades obrigatórias

- **Ordenação por cabeçalho** — colunas ordenáveis expõem cabeçalho clicável
  alternando `asc` → `desc` → neutro, com indicador visual da direção ativa.
- **Filtros com seleção múltipla** — filtros de coluna/barra aceitam múltiplos
  valores por campo, não apenas um.
- **Seleção e ação em massa** — checkbox por linha + "selecionar todas" no
  cabeçalho, habilitando a barra de ações em lote só quando há itens marcados.
- **Limpar filtros** — botão único que reseta todos os filtros e ordenações,
  visível apenas quando há algo aplicado.
- **Zebra striping** — linhas pares/ímpares alternam cor via `*.module.css`,
  nunca por estilo inline recalculado a cada render.
- **Contador de resultados** — mostrar `{exibidos} de {total}` quando há filtro.

## 2. Filtro simples e filtro avançado (coexistência)

Toda tabela densa oferece dois modos, alternados por um toggle **Simples /
Avançado**; o modo simples continua sendo o caminho rápido, o avançado é a
válvula para combinações complexas.

- **Modo simples** — grid de campos diretos (texto, select, faixa numérica,
  faixa de data). É o default.
- **Modo avançado (query builder)** — grupos aninhados de condições:
  - Cada **condição** = `campo` + `operador` + `valor` (e `valorAté` quando o
    operador é "entre").
  - Cada **grupo** combina suas condições por um conector **E / OU** próprio.
  - O **root** combina os grupos entre si por outro conector **E / OU**,
    permitindo `(A E B) OU (C)`.
  - Grupos e condições têm mínimo de 1; adicionar/remover é explícito.
- **Contagem de filtros ativos** — o badge do toggle usa `countFilterPills(pills)`
  no modo simples e `activeConditionCount` no modo avançado.

### Operadores por tipo de campo

O conjunto de operadores é **derivado do tipo do campo** (`OPERATORS_BY_TYPE`):

| Tipo   | Operadores                                   |
| ------ | -------------------------------------------- |
| Texto  | contém · não contém · igual a · diferente de |
| Número | = · ≠ · > · ≥ · < · ≤                        |
| Valor  | = · ≠ · > · ≥ · < · ≤                        |
| Data   | entre · antes de · depois de · igual a       |
| Select | igual a · diferente de                       |

Ao trocar o campo de uma condição, o operador é normalizado para o default do
novo tipo e o valor é limpo. Ao sair do operador "entre", `valorAté` é limpo.

### Semântica de avaliação (neutralidade)

- Condição **sem valor** não filtra (é neutra) — não zera o resultado.
- Grupo **sem nenhuma condição preenchida** é neutro (verdadeiro).
- Grupos ativos = os que têm ≥ 1 condição com valor. Modelo sem grupos ativos
  casa com todos os documentos.
- A avaliação é **pura e testável** (`evaluateAdvancedFilter`,
  `countActiveConditions`) — ver testes de contrato.

## 3. Reordenação e visibilidade de colunas com persistência

- O menu de colunas permite **mostrar/ocultar** e **reordenar** (mover
  acima/abaixo) cada coluna.
- A ordem e a visibilidade são **persistidas em `localStorage`** por uma chave
  versionada (ex.: `nfe-workspace.documents.columns.v1`).
- A leitura é **SSR-safe** e tolerante a `localStorage` indisponível (aba
  privada/cota): `try/catch` que degrada para o default, e sanitização na
  carga para sobreviver a mudanças de schema de colunas.
- `reorderColumns(order, column, 'up' | 'down')` é pura, não muta a entrada e é
  no-op nas bordas.

## 4. Estado, contrato e onde filtrar

- **Filtro/ordenação no cliente vs. servidor:** se o endpoint devolve o dataset
  completo (paginado por cursor), filtrar/ordenar no cliente é aceitável (caso
  da lista `/nfe-documents`). Para grandes volumes, os parâmetros
  (`sortBy`, `sortDirection`, `filters[]`, paginação) devem ir ao backend —
  nunca delegar só ao cliente.
- **Sem estado derivável em `useState`** — contadores, faixas e flags de
  seleção são derivados durante o render.
- **Lógica no hook** — toda a máquina de estado da tabela vive em um
  `use*Table.hook.ts`; os componentes (`*.component.tsx`) são declarativos.

## 5. Não-negociáveis de UI

- **Design tokens apenas** — cores/espaços/raios vêm de `:root`
  (`--color-*`, `--space-*`); proibido hex/px mágico no componente.
- **Sem string hardcoded** — todo texto visível vem do `*.locale.json` via
  `react-i18next` (labels de operadores, conectores, modos, ações de coluna).
- **Botões de ação icônicos** com `aria-label`/`title` traduzidos; estados
  desabilitados nas bordas (primeira/última coluna, grupo/condição único).
- **Dinheiro** exibido a partir do valor decimal em string, sem converter para
  float binário.

## 6. Evidência de teste obrigatória

Toda mudança nesta camada fecha com testes de contrato registrados
explicitamente no script `"test"` do `package.json` da app. Referências:

- `test/nfe-workspace/advanced-filter-and-columns.contract.ts` cobre o avaliador
  avançado (E/OU aninhado, operadores por tipo, neutralidade), o contador de
  condições ativas e a reordenação de colunas.
- `test/cte-batch/item-table.contract.ts` cobre o que a § 7 acrescenta:
  serialização de faixas na query string, ida e volta de cursor, soma acumulada
  entre páginas e os status escondidos por padrão.

## 7. Segunda referência viva: tabela de CT-es (`cte-batch`)

A tabela de CT-es de `/cte-batches` cumpre tudo acima e acrescenta três
capacidades que **toda tabela sobre volume grande deve copiar** — o dataset
fiscal cresce sem teto, então filtrar no cliente (§ 4) deixa de ser aceitável.

- **Paginação por cursor, com volta.** O endpoint devolve
  `{ data, page: { nextCursor } }`; `nextCursor` é opaco (`"<iso>::<uuid>"` sobre
  o keyset `(created_at desc, id desc)`) e o cliente **não** o interpreta. Como
  keyset não tem "página anterior", o hook guarda uma **pilha de cursores já
  visitados** para o botão de voltar; `hasNextPage` é `nextCursor !== null`. Toda
  mudança de filtro ou de ordenação reseta para `CTE_ITEM_FIRST_PAGE` — cursor de
  uma consulta não vale para outra.
- **Filtro e ordenação no servidor.** As faixas (`issuedFrom`/`issuedUntil`,
  `cteNumberGte`/`cteNumberLte`, `invoiceNumberGte`/`invoiceNumberLte`) e o
  `statusIn` viajam na query string **só quando preenchidas** — chave vazia não é
  serializada, e a API rejeita com `400` chave fora da allowlist, chave repetida,
  faixa invertida ou cursor corrompido.
- **Status escondido por padrão.** `CTE_ITEM_DEFAULT_HIDDEN_STATUSES`
  (`authorized`, `cancelled`, `in_flight`) sai do filtro inicial: CT-e já enviado
  à SEFAZ não polui a lista de trabalho, e volta só quando o chip do status é
  marcado. Quando uma tabela esconde linha por padrão, o default precisa ser uma
  constante exportada e testada — nunca um `if` solto no componente.
- **Situação de faturamento como coluna e chip.** `billingStatus` (`invoiced` /
  `pending`) vem derivado da API pela **mesma** regra da elegibilidade de
  faturamento — existir item de fatura para o documento fiscal tira o CT-e da
  fila — e o chip serializa `billingStatusIn` só quando restringe. Situação
  derivada de outro agregado é coluna do servidor, nunca cálculo do cliente.
- **Soma decimal da seleção, sobrevivendo à troca de página.** A seleção é por
  id e a soma vem de um **mapa acumulado** `id → { baseAmount, totalAmount }`
  alimentado a cada página carregada — assim o total não zera ao paginar nem
  depende da linha ainda estar na tela. A soma usa `sumScaledAmounts` (`BigInt`
  sobre string decimal, `Intl` só na formatação); **proibido** somar dinheiro em
  `Number`.
- **Onde cada coisa mora.** Estado e paginação em
  `hooks/useCteItemTable.hook.ts`; puro e testável em
  `shared/cteBatchItemTable.service.ts` (colunas, filtros, serialização,
  `CTE_ITEM_COLUMNS_STORAGE_KEY = 'cte-batch.items.columns.v1'`); HTTP em
  `shared/cteBatchItemClient.service.ts` com validação por type guard manual.
- **Controles recolhidos.** Filtros e organização de colunas não ficam inline:
  abrem por botão de ícone na barra da tabela (`aria-expanded`, `aria-label`
  traduzido, pastilha com a contagem de filtros ativos) e são montados só quando
  abertos. Vale para as duas tabelas da tela — lote e CT-e.

## 8. Pílulas de filtro ativo (obrigatório)

Filtro aplicado que não aparece na tela é filtro invisível: o usuário vê uma
lista curta e não sabe por quê. Toda tabela densa **precisa** mostrar uma pílula
removível por filtro ativo, logo abaixo do painel de filtros.

- **Componente único.** A pílula vem de `@/components/ui/filter-pills`
  (`components/ui/filter-pills.tsx`). Ele é agnóstico de i18n: recebe
  `removeLabel`/`clearAllLabel` já traduzidos, devolve `null` quando não há
  pílula e renderiza o "limpar tudo" junto delas. Proibido cada módulo desenhar
  a sua própria pílula.
- **Descritor puro por módulo.** A tradução não entra no serviço: cada módulo
  tem um `shared/<modulo>FilterPills.service.ts` com
  `describe*FilterPills({ filters, formatDay })` devolvendo descritores
  `{ field, labelKey, value, valueKey? | valueKeys? }`. `formatDay` é injetado
  para a pílula de data ser assertável sem depender do `Intl` da máquina. O
  componente é quem chama `t()` e liga o `onRemove`.
- **Remoção por campo no hook.** O mesmo serviço exporta
  `clear*FilterField({ field, filters })`, exposto pelo hook como
  `clearFilterField`. Limpar uma faixa zera as **duas** pontas; limpar uma
  seleção múltipla cujo default já esconde valores (§ 7) restaura o **default**,
  nunca `[]` — seleção vazia esconderia a tabela inteira. Em tabela paginada,
  remover pílula reinicia a paginação.
- **A contagem vem das pílulas.** No modo simples o badge do filtro usa
  `countFilterPills(pills)`, não um contador paralelo. Pílula que resume mais de
  um filtro declara o próprio peso em `count` — é o caso da pílula do filtro
  avançado salvo, que vale `savedConditionCount`: sem isso o badge dizia `1` ao
  lado de uma pílula escrita "3 condições". Pílula de campo simples omite `count`
  e vale 1; no modo avançado a contagem continua vindo do
  construtor de condições, e nesse modo não há pílula — condição E/OU aninhada
  não cabe em pílula. Onde a tela já tinha um botão "limpar tudo" na barra, ele
  só aparece quando `pills.length === 0`, para não duplicar o controle.
- **Rótulos por chave.** `labelKey`/`valueKeys` são chaves de locale, com par
  pt/en obrigatório (os contratos de paridade falham se faltar o gêmeo em `en`).
  Sigla que já é o próprio rótulo (UF, por exemplo) vai em `value` cru.
- **Separadores centralizados.** `OPEN_RANGE_MARK`, `RANGE_SEPARATOR` e
  `SELECTION_SEPARATOR` vivem em `src/modules/shared/filterPill.service.ts`,
  junto de `describeRangeValue` e `selectionDiffersFromDefault` — literal
  repetido em módulo é rejeitado em review.
- **Contrato.** `test/design-system/filter-pills.contract.ts` cobre o
  componente, os descritores de cada módulo e esta regra.

## 9. Contagem no botão de filtro (obrigatório)

O número de filtros ativos aparece como **badge no canto** do botão de ícone, e
vem de `@/components/ui/count-badge` (`components/ui/count-badge.tsx`) — proibido
cada módulo desenhar a sua. Em fluxo dentro do botão o número estourava a borda:
o botão de ícone tem largura fixa (`2.25rem`) e `padding: 0`, então a contagem
vazava para fora ou empurrava o botão para um retângulo, e a barra ficava com um
botão de tamanho diferente dos vizinhos.

- **Forma.** `position: absolute` sobre o canto superior direito
  (`top`/`right: calc(var(--space-1) * -1)`), quadrado cobre como o resto da
  linguagem (`border-radius: 0`, `var(--color-copper)`), só tokens.
- **Botão hospedeiro é contexto de posicionamento.** Toda classe `.iconAction` /
  `.iconActionActive` declara `position: relative`; sem isso o badge se ancora no
  ancestral errado. O botão permanece quadrado com ou sem filtro aplicado.
- **Decorativo.** `aria-hidden="true"`: o número repete o que as pílulas de
  filtro (§ 8) já dizem em texto, e o botão carrega o próprio `aria-label`.
- **Sem contagem, sem badge.** `count <= 0` devolve `null`.
- **Contrato.** `test/design-system/count-badge.contract.ts`.
