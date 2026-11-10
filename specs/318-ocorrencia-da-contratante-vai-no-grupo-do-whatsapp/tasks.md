# Tarefas — Feature 318

Modelo por etapa (regra do projeto): o coordenador abre cada etapa numa thread com o modelo indicado. Alvo: staging.

## Etapa 0 — Respostas do Anderson · Modelo: n/a

- [ ] T0 Fechar as dúvidas da spec (grupo, número, reserva de e-mail, momentos, texto).

## Etapa 1 — Banco · Modelo: padrão do projeto

- [ ] T1 Teste de migration (antes): tabela, CHECKs (canal, `@g.us`, telefone), únicos, padrão `email`.
- [ ] T2 Migration aditiva + schema Drizzle; `make migration-test`.

## Etapa 2 — API · Modelo: opus (idempotência e fallback)

- [ ] T3 Contratos de teste: grupo sem e-mail, e-mail inalterado, idempotência, falha com reserva, sem dado sensível no texto.
- [ ] T4 Política de canal + porta + adapter (reuso de `sendEvolutionTextWithMention`).
- [ ] T5 Caso de uso do aviso automático decidindo o canal; resultado na linha do tempo.
- [ ] T6 Rotas de configuração e de teste; lista de grupos.
- [ ] T7 Arquivos de teste novos na lista do `package.json` da API.

## Etapa 3 — Painel · Modelo: padrão do projeto

- [ ] T8 Bloco na tela da contratante (componentes padrão), botão de teste; prints claro/escuro, desktop/celular.

## Etapa 4 — Staging · Modelo: padrão do projeto

- [ ] T9 Configurar a Única em staging (script em `tmp/ops`), roteiro de teste com grupo de teste, evidência.
- [ ] T10 Registrar no runbook; decisão de levar o Evolution a produção fica separada.
