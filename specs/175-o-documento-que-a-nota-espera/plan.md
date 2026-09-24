# Plano — Feature 175

## O que já existe, e por isso não se reescreve

| Peça                        | Onde                                                                                              | O que faz                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Política do documento       | `apps/api-transportada/src/trips/domain/fiscal-document-kind.policy.ts:46`                        | Mesmo município → `nfse`; outro → `cte`; sem município → `null` |
| `expectedDocument` por nota | `apps/api-transportada/src/trips/infrastructure/trip-fiscal-readiness.query.ts:292`               | Já viaja na resposta de prontidão                               |
| Selo na linha               | `apps/frontend-transportada/src/modules/trip/components/TripStopList.component.tsx:373`           | Entregue pela spec 174                                          |
| Botão da linha              | `TripStopList.component.tsx:386`                                                                  | Fixo em `Gerar CT-e` — é o que muda                             |
| Diálogo de NFS-e            | `apps/frontend-transportada/src/modules/nfse-invoice/components/NfseEmissionDialog.component.tsx` | Preview + perfil + emissão                                      |
| Hook do diálogo             | `apps/frontend-transportada/src/modules/nfse-invoice/hooks/useNfseEmissionDialog.hook.ts`         | Preview e create                                                |
| Gate hoje                   | `apps/frontend-transportada/src/modules/nfse-invoice/shared/nfseEmission.service.ts:101`          | Usa `nfse.manage` — divergente                                  |
| Permissão da rota           | `apps/api-transportada/src/nfse-invoices/presentation/nfse-invoices.routes.ts:172`                | Exige `nfse.issue`                                              |

**O trabalho é quase todo de frontend.** Backend só entra se `expectedDocument` não estiver
chegando ao componente da linha — conferir antes de escrever qualquer coisa na API.

## Ordem

1. **A divergência de permissão primeiro** (RF6). É defeito vivo, independe do resto e cabe num
   commit sozinho: o contrato que prova a permissão do gate contra a da rota é o que impede a
   dupla voltar a divergir.
2. **A ação guiada pelo `expectedDocument`** (RF1, RF2, RF4, RF7): o rótulo e a existência do botão
   passam a sair do dado.
3. **O caminho da NFS-e** (RF3, RF5): abrir o diálogo existente com a nota pré-selecionada, e o
   estado de "sem perfil".
4. **O resumo** (RF8) e as locales (RF9).
5. **Revisão de design com print** (CA08).

## Riscos

- **Reaproveitar o diálogo entre módulos**: `trip` passaria a depender de `nfse-invoice`. Se essa
  dependência for proibida pela fronteira de módulos do frontend, a saída é levantar o diálogo para
  um lugar compartilhado — **não** duplicá-lo. Conferir a fronteira antes de importar.
- **Atalho por viagem**: se a emissão por `documentIds` de um item não servir (por exemplo, porque
  o perfil depende de agrupamento), isso vira ADR, não improviso dentro da task.
- **Guard de chave fechada**: `expectedDocument` já é chave conhecida da resposta de prontidão;
  qualquer campo novo que a implementação precise cai na regra de "frontend tolerante primeiro" —
  o bundle aceita a chave antes de a API emitir.

## Modelos

> 🤖 Fase 1 e 2: `sonnet` · Fase 3: `sonnet` (a decisão de fronteira de módulos é 🧠 — validar com
> `architect` em `opus` **antes** de importar o diálogo) · Revisão final: `code-reviewer` em `opus`.

## Gates de cada task

`bun run typecheck` · `bun run lint` · `bun run test` da app tocada · commit isolado · evidência em
`evidence.md`. Teste de contrato **antes** da implementação.
