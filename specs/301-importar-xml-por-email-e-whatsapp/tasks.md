# Tasks — 301 Importar XML de NF-e por e-mail e por WhatsApp

Uma task por vez; cada uma fecha com typecheck + testes da app + evidência em `evidence.md`.

## Fase 0 — Conferência e contratos
> 🤖 Modelo: `opus` (T0.1) · `sonnet` (T0.2)
- [ ] **T0.1 🧠** Conferir no código: como o `requestUpload` recebe arquivos já em storage (`stagedSources`), qual ator
      usar sem usuário logado (D3), onde o webhook da Evolution entrega `documentMessage`, e como o Resend entrega anexos.
      Aceite: `plan.md` com arquivo:símbolo.
- [ ] **T0.2** Contratos vermelhos: extração de anexos (zip/soltos/hostis), autorização de remetente, idempotência.

## Fase 1 — Núcleo comum (API)
> 🤖 Modelo: `sonnet` (migration → `opus`)
- [ ] **T1.1 🧠** Migration aditiva `nfe_imports.source` += `email`, `whatsapp` + origem/remetente; rollback; teste de migração.
- [ ] **T1.2** Serviço "importar XML recebido" reutilizando `requestUpload` e o leitor de zip seguro.

## Fase 2 — E-mail
> 🤖 Modelo: `sonnet`
- [ ] **T2.1** Webhook assinado da caixa de notas, allowlist + DKIM, anexos do Resend, idempotência por `email_id`.
- [ ] **T2.2** Resposta-resumo ao remetente e configuração (endereço, allowlist) nas Configurações.

## Fase 3 — WhatsApp
> 🤖 Modelo: `sonnet`
- [ ] **T3.1** Handler de documento (marcação ao bot em grupo, ou conversa direta), número cadastrado, download da mídia pela Evolution.
- [ ] **T3.2** Resposta-resumo na conversa/grupo.

## Fase 4 — Tela e fechamento
> 🤖 Modelo: `haiku`
- [ ] **T4.1** Origem e remetente na lista de importações; roteiro de teste em staging; atualizar runbook se houver passo em produção.
