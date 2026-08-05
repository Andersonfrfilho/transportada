# ADR-0024: Tabela de viagens reduz o contrato de `docs/frontend/data-tables.md`

## Contexto

`docs/frontend/data-tables.md` é regra de projeto obrigatória para toda tela do frontend que
renderize dados tabulares densos, e é explícito: "Divergência exige ADR em `docs/adr/`." O
contrato pede, entre outras capacidades: cabeçalho ordenável em todas as colunas, filtro de
seleção múltipla, seleção em massa por linha com barra de ação em lote, e reordenação/visibilidade
de colunas persistida em `localStorage`.

Os dois módulos existentes que seguem o contrato por completo — `billing` (fatura) e
`mdfe-manifest` (manifesto MDF-e, o "irmão mais próximo" da viagem segundo o comentário de
`trip.port.ts`) — o fazem porque têm volume real de colunas (9 e 10, respectivamente), filtros que
fazem sentido como seleção múltipla (situação, UF de destino) e, no caso do MDF-e, uma ação em
lote real (transmitir vários manifestos de uma vez).

A viagem (`GET /trips`, `trip.routes.ts`) não compartilha essas condições:

- **4 colunas** na listagem (`vehicleId`, `status`, `createdAt`, `updatedAt` — ver
  `serializeTrip`); condutores e notas só aparecem no detalhe. Reordenar/ocultar 4 colunas não
  reduz ruído nenhum — é o oposto do problema que a seção 3 do doc resolve.
- **Sem endpoint de ação em lote.** Nenhuma rota de `trips` opera sobre mais de uma viagem por
  chamada (`POST /trips/:id/close`, vincular/entregar/desvincular documento — todas são por `id`).
  Uma barra de seleção em massa sem ação nenhuma atrás dela é affordance morta.
- **Sem suporte de servidor a ordenação nem a filtro de seleção múltipla.** `trip.port.ts` já
  documenta essa lacuna do backend (comentário sobre `TripFilters`): nenhuma rota real do sistema
  implementa `sortBy`/`sortDirection` — nem `nfe-workspace`, nem `cte-batches`; `trips` segue o
  padrão de `mdfe-manifests`, que é cursor keyset com ordenação fixa no servidor
  (`desc(createdAt), desc(id)`). Diferente do MDF-e, porém, a viagem também **não carrega a página
  inteira no cliente** — a listagem é paginada por cursor de verdade, uma página por vez. Filtro de
  seleção múltipla avaliado no cliente pressupõe o dataset completo em memória (§4 do doc); contra
  uma página parcial, filtrar por múltiplos valores no cliente devolveria resultado incompleto e
  silenciosamente errado. Os filtros de `trips` (`statusEq`, `vehicleIdEq`, `driverIdEq`,
  `createdFrom`, `createdUntil`) por isso são de valor único, mapeados 1:1 para os parâmetros que o
  servidor já aceita.

## Decisão

A tabela de viagens (`apps/frontend-transportada/src/modules/trip/`) implementa o subconjunto do
contrato que se aplica de verdade:

- Cabeçalho ordenável **client-side, dentro da página corrente** (asc/desc/neutro, indicador
  visual) — mesmo padrão de toggle tri-state de `billing`/`mdfe-manifest`, mas sem parâmetro de
  ordenação ao servidor, pelo motivo acima.
- Filtros de valor único por campo (status, veículo, condutor, período de criação), refletidos nos
  parâmetros reais de `GET /trips`, com pílulas removíveis (`@/components/ui/filter-pills`) e botão
  "limpar filtros".
- Paginação por cursor com histórico de navegação (mesmo padrão de `cte-batch`).
- Zebra striping, contador "{exibidos} de {total}", estado vazio e mensagem de acesso negado.

Ficam **fora** desta primeira versão, por ausência de base real (nenhum código morto é escrito à
toa):

- Reordenação/visibilidade de colunas — 4 colunas não justificam o mecanismo.
- Seleção em massa e barra de ação em lote — não existe ação em lote no backend.
- Filtro avançado com grupos E/OU aninhados — não há campo dessa complexidade na viagem.

Se a viagem ganhar mais colunas (ex.: resumo de notas vinculadas na própria listagem) ou uma ação
em lote no backend, os itens acima voltam à mesa e este ADR é revisitado.

## Consequências

- `apps/frontend-transportada/src/modules/trip/shared/tripTable.service.ts` expõe só ordenação
  client-side de página corrente e paginação por cursor — sem `tableColumnPreferences.service.ts`
  nem seleção.
- O contrato de teste `test/design-system/data-tables.md` (checklist manual, se existir) marca os
  itens de coluna/seleção em massa como "N/A — ver ADR-0024" para o módulo `trip`.
- Documentado também em `specs/027-viagens-nao-fiscais/evidence.md` § T010.
