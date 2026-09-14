# Spec 113 — Tarefas

> 🤖 Modelo: `opus` (empacotador — `docs/domain/cargo-placement.md` lido antes)

| id  | tarefa                                                                                  | depende | verificação                                     | status |
| --- | --------------------------------------------------------------------------------------- | ------- | ----------------------------------------------- | ------ |
| T1  | Contrato da grade (`test/cargo-placement/grid.contract.ts`) antes da implementação      | —       | `bun test ./test/cargo-volume.contract.test.ts` | feita  |
| T2  | `grid` em `STOP_ARRANGEMENTS`, `resolveGridLanes` e `placeGrid`                         | T1      | idem + `bun run typecheck`                      | feita  |
| T3  | Faixa aparada à largura das caixas (`packedLaneWidthM`) — a folga tirava o confinamento | T2      | medição de faixa isolada                        | feita  |
| T4  | Grade só quando coloca o que a profundidade coloca (`gridOrDepth` empacota os dois)     | T2      | contrato `carga que cabe é colocada`            | feita  |
| T5  | ~~Piso da fatia~~ **revertido**: fatias passavam do baú; divisão sem teto global        | —       | extensão da carga ≤ comprimento do baú          | feita  |
| T6  | Frontend aceita `grid` (tipos, validação, legenda, chips, textos)                       | T2      | testes do módulo `trip`                         | feita  |
| T7  | `docs/domain/cargo-placement.md` e `CLAUDE.md`                                          | T2–T5   | leitura                                         | feita  |

Contratos antigos alterados de propósito, com a razão no próprio teste: peso acima de metade do teto
passa a `grid` (099 D3 continua valendo dentro da faixa), "faixas cabem todas ou nenhuma" passa a
`grid`, a tabela de carga pesada descreve `grid`, e o fixture da carga dividida estoura por
quantidade em vez de pelo defeito da fatia sem piso.

⚠️ Deploy: o frontend **aceita** `grid` e precisa subir junto ou antes — com a API nova e o frontend
antigo, a validação recusa o arranjo e o painel de carga some.
