# Tarefas — Feature 321

Cada etapa abre numa thread com o modelo indicado (regra de modelo por spec). Contrato antes do código. Tudo para `staging`;
nada para `main` (não é bug crítico). **Nenhuma task começa com `[NEEDS CLARIFICATION]` aberto em `spec.md`.**

- [ ] **T0** Só leitura: (a) casamento do canhoto do worker 294 com nota entregue de outra viagem; (b) como uma nota entregue/solta pode entrar em outra viagem hoje e o que a prende (estado, parada, `leaves_document_behind`); (c) todos os pontos que somam peso, volume, dimensão e ocupação da viagem (D4c); (c2) quem lê `notifies` /
      `emails_contractor` (143/269/271/318); (d) como a 275 agrupa o aviso ao painel; resultado em `evidence.md`. — Modelo: sonnet
- [ ] **T1** [contrato primeiro] Entrada no catálogo + teste CA01 (nunca notifica) + paridade painel/app. — Modelo: sonnet
- [ ] **T2** [contrato primeiro] Guarda `occurrenceTypeNeverNotifiesContractor` nos três pontos de aviso; teste CA02. — Modelo: opus
- [ ] **T3** [contrato primeiro] Resolução/reabertura automática ao chegar/reprovar o canhoto; duplicidade; teste CA04. — Modelo: opus
- [ ] **T2b** [contrato primeiro] Devolução da nota pelo caminho da 164 com reentrega autorizada pelo tipo, sem contratante (D4); viagem de origem fecha, nota elegível a outra viagem. Coluna nova só se a T0 mostrar que não basta. — Modelo: opus
- [ ] **T2c** [contrato primeiro] Migration aditiva `counts_cargo_on_pickup_trip` (junto da T2b) e exclusão da nota de coleta das somas da viagem nova; teste CA03b; seletor na aba Tipos. — Modelo: opus
- [ ] **T4** Nota na nova viagem como "coletar canhoto"; finaliza pela foto (D4b/D8); ajuste do casamento se a T0 mostrar lacuna. — Modelo: opus
- [ ] **T5b** Painel: flag "Coleta de canhoto" com tooltip na viagem nova (D4d); locale; prints claro/escuro, desktop/celular. — Modelo: sonnet
- [ ] **T5** Painel: selo "canhoto retido" e filtro na lista de ocorrências; prints (CA05). — Modelo: sonnet
- [ ] **T6** Script de staging: acrescentar o tipo a `staging-configura-tipos-ocorrencia.sh` (dry-run primeiro), runbook atualizado.
      — Modelo: sonnet
- [ ] **T7** Documentação: `apps/api-transportada/CLAUDE.md`, `docs/ai-context/api-transportada.md`, `evidence.md`. — Modelo: sonnet
- [ ] **T8** Publicação em staging na ordem painel → API → app e conferência de CA01–CA05. — Modelo: sonnet
