# Padrão de tabelas com muitas informações (data tables)

Regra de projeto **obrigatória** para toda tela do frontend que renderize dados
tabulares densos (listagens, grids, relatórios). Consolidada a partir da tabela
"Notas" do módulo `nfe-workspace`; toda tabela nova ou existente que carregue
muitas colunas/registros deve seguir este contrato. Divergência exige ADR em
`docs/adr/`.

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
- **Contagem de filtros ativos** — o badge do toggle usa `pills.length` no
  modo simples e `activeConditionCount` no modo avançado.

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
explicitamente no script `"test"` do `package.json` da app. Referência:
`test/nfe-workspace/advanced-filter-and-columns.contract.ts` cobre o avaliador
avançado (E/OU aninhado, operadores por tipo, neutralidade), o contador de
condições ativas e a reordenação de colunas.
