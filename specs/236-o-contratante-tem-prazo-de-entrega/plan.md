# Plano — 236

## Abordagem

Esta spec é **só derivação e exibição**: não cria coluna nem tela de contratante (moram na 237) nem
calendário (238). Política pura, leitura no join que já existe, selo e filtro.

## Decisões de desenho

- **Derivado, nunca gravado:** muda com o perfil e o calendário; sem backfill.
- **Política pura** `src/trips/domain/delivery-deadline.policy.ts`: relógio, fuso e calendário por parâmetro;
  janela de separação em **horas corridas**, depois **dias úteis** (238).
- **Âncora:** `cargo_arrivals.arrived_at` da chegada em que a nota está (237). Nota que não passou por
  chegada fica `not_applicable`.
- **Entrega medida pelo momento da 234** (`deliveredMomentSql`).
- **Fuso:** o da empresa (decidido na 238).
- **Leitura:** o repositório do detalhe da viagem já faz o join emitente → `contractors`; acrescenta perfil
  e chegada no mesmo caminho e passa a política pronta ao mapper — sem resolvedor paralelo.
- **Painel:** selo no padrão dos selos de comprovante; filtro na lista de viagens/notas.

## Dependências e ordem

1. **238** publicada (calendário). 2. **237** Fases 1–2 publicadas (perfil e chegada). 3. **236**.

## Riscos

- Âncora/calendário errados = prazo errado em toda nota: por isso D6 e D7 são bloqueantes.
- O contrato de "sem N+1" precisa existir (a política roda por nota; o calendário carrega por cidade).
- A divergência dos três chamadores do comprovante (resolução em duas camadas) **não** é consertada aqui.
- Numeração: reconferir spec/ADR em `origin/staging` e nos worktrees antes de publicar.

## Documentação viva ao fechar

`docs/spec/domain-model.md`, `docs/ai-context/api-transportada.md`, `docs/ai-context/frontend-transportada.md`,
`CLAUDE.md` das duas apps.
