# 063 — o cliente tem portal · tasks

> 🤖 Modelo: `sonnet` de padrão. T001, T003 e T005 são 🧠 (`opus`) — enumeração, isolamento e payload
> mínimo são o que não dá para consertar depois de vazar.

As quatro `[NEEDS CLARIFICATION]` estão respondidas: **rastreamento ao vivo entra** (com
consentimento e expurgo), a empresa vem do **subdomínio** (a instalação é dedicada) e a spec vem
antes da 062.

⚠️ **O acesso mudou de desenho durante a execução, por decisão do cliente (2026-08-27):** o portal
não é entrada anônima por código de uso único, e sim **conta de usuário** com o papel `contractor`,
amarrada a um ou mais documentos por `contractor_portal_bindings` — as notas do portal são as dos
documentos amarrados. A ADR-0050 §2 foi reescrita; T003 e T004 mudaram de conteúdo junto.

| Task    | O que                                                                            | Requisito | Estado |
| ------- | -------------------------------------------------------------------------------- | --------- | ------ |
| T001 🧠 | ADR-0050, e a spec sem cláusula em aberto                                        | —         | ✅     |
| T002    | Migration: vínculo contratante↔documento, papel, ping de posição, consentimento | 2, 3      | ✅     |
| T003 🧠 | O recorte do contratante: documentos da conta, e nenhum vindo do cliente         | 2, 8      | ✅     |
| T004    | Administrar o vínculo: convidar contratante e amarrar documento                  | 2, 3, 4   | ✅     |
| T005 🧠 | `/client/me/deliveries`: payload mínimo, com contrato que reprova campo interno  | 4, 5      | ⬜     |
| T006    | Agendar pelo portal, pela máquina de estados da 060                              | 6         | ⬜     |
| T007    | O contratante aprova o lote linha a linha, com ator externo na trilha            | 7         | ⬜     |
| T008    | O ping do motorista: consentimento, ingestão e expurgo no fechamento             | —         | ⬜     |
| T009    | `apps/frontend-client`: Vite, PWA, CSP própria, Docker e compose                 | 1, 9      | ⬜     |
| T010    | As telas: entrar, minhas entregas, agendar, aprovar repasse, mapa desenhado      | 1, 10     | ⬜     |
| T011    | E2E: entrar → ver entrega → agendar → aprovar, e o teste de enumeração           | —         | ⬜     |

`docs/SECURITY.md` ganha a seção do portal junto da T005 — enumeração, retenção de sessão e dado
exposto —, não no fim.
