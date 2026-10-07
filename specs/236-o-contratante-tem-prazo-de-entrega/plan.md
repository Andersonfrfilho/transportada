# Plano — 236

## Abordagem

Esta spec é **só derivação e exibição**: não cria coluna nem tela de contratante (moram na 237) nem
calendário (238). Política pura, leitura no join que já existe, selo e filtro.

## Decisões de desenho

- **Derivado, nunca gravado:** o prazo em dias é **copiado** do perfil na chegada (237) e só o vencimento muda,
  com o calendário; sem backfill.
- **Política pura** `src/trips/domain/delivery-deadline.policy.ts`: datas civis em texto, sem relógio, sem fuso e
  sem I/O; calendário já montado por parâmetro; `dueOn = addBusinessDays(chegada, N)` (238); a janela de
  separação de 24 h não existe na assinatura (corre dentro dos dias úteis). A borda
  `src/trips/application/delivery-deadline-input.service.ts` converte o instante em data civil.
- **Cidade do calendário = destino físico:** a cidade da parada da nota (`stopAddresses`), com o **desvio manual
  por cima**. O desvio **não** mora em `resolvePhysicalDestination` (que só conhece `delivery` e `recipient`):
  mora em `delivery_address_overrides`, um por `trip_document`, vale o mais recente
  (`trip.schema.ts` ~1157–1173; `drizzle-delivery-address-override.repository.ts` ~249–264). Quem chama resolve
  o código IBGE; a política só recebe o calendário (ou `null` = `no_destination_city`).
- **Desvio manual:** uma consulta `selectDistinctOn(trip_document_id)` em `delivery_address_overrides` por viagem,
  nunca por nota.
- **Âncora:** `cargo_arrivals.arrived_at` da chegada em que a nota está (237). Nota que não passou por
  chegada fica `not_applicable`.
- **Entrega medida pelo momento da 234** (`deliveredMomentSql`).
- **Fuso:** fixo `America/Sao_Paulo` (`BUSINESS_CALENDAR_TIME_ZONE`, ADR-0096 Q3); sem coluna por empresa.
- **Leitura:** o detalhe da viagem **não** faz join com `contractors` e o contratante nem entra: o prazo copiado
  está em `cargo_arrivals`, e a chegada entra pelo `nfe_document_id` (via `cargo_arrival_documents`), passando a
  política pronta ao mapper — sem resolvedor paralelo. O calendário **não é uma consulta**: o `loadRules` da 238
  faz quatro, e dentro da transação do `readTripDetail` elas rodam em **série** (T1.2a). O campo vive só no
  `TripDocumentDetail`, nunca no `TripDocument`.
- **Painel:** selo no padrão dos selos de comprovante; filtro na lista de viagens/notas.

## Dependências e ordem

1. **238** publicada (calendário; falta a T1.4). 2. **237** Fases 1–2 publicadas (perfil e chegada — já em staging). 3. **236**.

## Riscos

- Âncora/calendário errados = prazo errado em toda nota: o teste de tabela cobre fim de semana, feriado e aniversário.
- O contrato de "sem N+1" precisa existir (a política roda por nota; o calendário carrega por cidade).
- A divergência dos três chamadores do comprovante (resolução em duas camadas) **não** é consertada aqui.
- Numeração: reconferir spec/ADR em `origin/staging` e nos worktrees antes de publicar.

## Documentação viva ao fechar

`docs/spec/domain-model.md`, `docs/ai-context/api-transportada.md`, `docs/ai-context/frontend-transportada.md`,
`CLAUDE.md` das duas apps.
