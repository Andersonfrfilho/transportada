# Plano — 236

## Abordagem

Dado mínimo (uma coluna), política pura de domínio, leitura derivada no join que já existe, e a primeira
tela de contratante. Nada de nova tabela nem de novo resolvedor: o prazo é um atributo do contratante, não
uma camada de configuração do comprovante (ADR-0057/0070 tratam `company_delivery_proof_settings` como do
comprovante, e misturar prazo de mercadoria ali foi descartado).

## Decisões de desenho

- **Coluna em `contractors`, não tabela filha.** É um atributo simples, sem herança (não há "padrão da
  empresa"); a tabela filha serviria a precedência por camadas que esta feature não tem.
- **Derivado na leitura.** `deliveryDueAt` não é gravado: muda com a ficha, sem backfill, sem reprocesso.
- **Política pura** `src/trips/domain/delivery-deadline.policy.ts`: `resolveDeliveryDeadline({ anchorAt,
deadlineDays, deliveredMomentAt, now, timeZone })` → `{ dueAt, state, daysLate? }`. Relógio e fuso entram
  por parâmetro.
- **Fuso:** o da empresa (verificar `companies`); se não existir, `America/Sao_Paulo` numa constante
  (decidir na T1.1 e registrar).
- **Âncora** segue a resposta de [D1]; o repositório a lê junto do `contractorId`.
- **Entrega medida pelo momento da 234** (`deliveredMomentSql`), nunca por `recorded_at`.
- **Painel:** aba "Contratantes" em `DeliveryClientWorkspace.page.tsx` (`DeliveryClientTabId`), ficha no
  molde de `DeliveryClientForm`, hooks/queries no padrão do módulo; selo no padrão de
  `tripDocumentProofBadges.service.ts`.

## Riscos

- Guardas de chaves exatas do painel (RF3) rejeitam `GET /contractors` se esquecidas — contrato de
  paridade das três cópias.
- Âncora errada = prazo errado em toda nota: por isso [D1] é bloqueante.
- Duas outras sessões já usam o número 235; conferir o próximo número livre e o próximo ADR (0093 tomado
  em worktree; o seguro hoje é 0094) imediatamente antes de publicar.
- A divergência de resolução em duas camadas (comprovante) **não** é consertada aqui; só registrada.

## Documentação viva ao fechar

`docs/spec/domain-model.md` (coluna nova), `docs/ai-context/api-transportada.md`,
`docs/ai-context/frontend-transportada.md`, `apps/api-transportada/CLAUDE.md` e
`apps/frontend-transportada/CLAUDE.md`.
