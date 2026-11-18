# Tarefas — Feature 344

Cada etapa abre numa thread com o modelo indicado (regra de modelo por spec). Contrato antes do código. Tudo para `staging`; nada para `main` (melhoria, não bug crítico).

- [ ] **T1** [contrato primeiro] Leitor `readStopReceivingWindows` (parada → destinatários → janela do dia, D2) e política `checkArrivalAgainstWindow`; testes com janela de manhã e tarde, dia fechado, exceção, feriado, sem janela, destinatários divergentes. — Modelo: opus
- [ ] **T2** `receivingWindow` no detalhe da viagem e em `GET /me/trips/current`; `receivingWindowCheck` na resposta da chegada (painel e motorista). — Modelo: opus
- [ ] **T3** Bot: linha da janela no bloco da parada e aviso na chegada (grupo e individual); atualizar as transcrições esperadas das jornadas. — Modelo: opus
- [ ] **T4** Painel (detalhe da viagem/parada): janela e aviso; componentes padrão; locale pt-BR/en; prints claro/escuro × desktop/celular. Revisor independente. — Modelo: sonnet
- [ ] **T5** App do motorista: janela na parada e aviso ao chegar; mesmos prints e revisor. — Modelo: sonnet
- [ ] **T6** Staging: conferir CA01–CA05 com uma parada de cliente que recebeu janela (staging tem 99); runbook. — Modelo: sonnet
