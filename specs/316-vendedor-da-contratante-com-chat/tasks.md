# Tasks — 316 O vendedor da contratante e o chat com ele

Uma task por vez, PR para staging, merge com CI verde. Contrato: `bun --env-file=../../.env.test test --timeout 120000`;
integração: `bun --env-file=../../.env.test run test:integration` (de dentro de `apps/api-transportada`). Task só fecha com
evidência em `evidence.md`. As duas dúvidas restantes são não bloqueantes (padrão adotado na spec).
Telas: componentes padrão do design system, prints claro/escuro e desktop/celular antes do PR.

## Fase 0 — Decisões

- [x] **T0.1** Anderson respondeu as dúvidas em 2026-11-10; spec e plano atualizados.
  > 🤖 Modelo: `opus`
- [ ] **T0.2** ADR: vendedor como entidade, N:N com contratantes, carteira, papel `salesperson` **no painel (emenda a ADR-0050)**. Aceite: ADR aceita pelo Anderson.
  > 🤖 Modelo: `opus`

## Fase 1 — Cadastro do vendedor (escritório)

- [ ] **T1.1** Contratos vermelhos: carteira única por (contratante, cliente), isolamento por empresa, mascaramento.
  > 🤖 Modelo: `sonnet`
- [ ] **T1.2** Schema + migration aditiva + rollback (`make migration-test`).
  > 🤖 Modelo: `sonnet`
- [ ] **T1.3** API de cadastro, ligação e carteira (escritório), com auditoria.
  > 🤖 Modelo: `sonnet`
- [ ] **T1.4** Tela "Vendedores" no painel (design system; prints claro/escuro, desktop/celular).
  > 🤖 Modelo: `sonnet`
- [ ] **T1.5** Importação da carteira em lote (o Anderson sobe a lista depois; formato a definir com ela).
  > 🤖 Modelo: `sonnet`

## Fase 2 — Roteamento e chat com o vendedor

- [ ] **T2.1** Colunas `forward_targets` e `salesperson_mail_template_key` no tipo + editor da aba Tipos (`.strict()`).
  > 🤖 Modelo: `sonnet`
- [ ] **T2.2** Ações "Encaminhar à contratante" / "Encaminhar ao vendedor" no escritório, resolução dos vendedores no servidor e
      aviso "cliente sem vendedor" com "Vincular vendedor" e "Cadastro rápido" (D4, D6).
  > 🤖 Modelo: `opus` (decide quem recebe)
- [ ] **T2.3** Participante `salesperson` e canais WhatsApp/e-mail no catálogo (287 RF6b); modelo de e-mail HTML publicado.
  > 🤖 Modelo: `opus`
- [ ] **T2.4** Conversa "Vendedor" na tela da ocorrência (aba/coluna), seletor "Enviar por", selos de estado.
  > 🤖 Modelo: `sonnet`
- [ ] **T2.5** Webhook/bot reconhece o telefone do vendedor (308 D2) e encaminha à conversa; nunca menu.
  > 🤖 Modelo: `opus`
- [ ] **T2.6** Os três tipos (Endereço incorreto, Espera longa, Cobrança no recebimento) sem aviso automático e com `forward_targets`
      (RF10); ativação em staging por script com aprovação.
  > 🤖 Modelo: `sonnet`

## Fase 3 — Área do vendedor

- [ ] **T3.1** Papel `salesperson` no realm versionado + reconciliação + convite.
  > 🤖 Modelo: `opus`
- [ ] **T3.2** Rotas `/me/salesperson/*` com guarda de carteira e contratos negativos.
  > 🤖 Modelo: `opus`
- [ ] **T3.3** Casca mínima do vendedor no painel (lista da carteira, filtros, chat, anexos, PWA), com contrato negativo de rotas.
  > 🤖 Modelo: `sonnet`

## Fase 4 — Fechamento

- [ ] **T4.1** Roteiro de staging (`roteiro-teste-staging.md`), runbook, `CLAUDE.md` da API e `docs/ai-context/` atualizados.
  > 🤖 Modelo: `sonnet`
- [ ] **T4.2** Teste real em staging com número e e-mail do Anderson como vendedor de teste. **Pendente do Anderson.**
  > 🤖 Modelo: `sonnet`
