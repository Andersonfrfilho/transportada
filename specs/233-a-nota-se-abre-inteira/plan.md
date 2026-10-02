# Plano — 227 A nota se abre inteira

## Contexto e premissas

Quase tudo que o canvas mostra **já existe**, espalhado. O trabalho é **reorganizar** em um acordeão e
**acrescentar** três coisas pequenas (Série/CNPJ/copiar, link de ocorrência, ordem da página) mais duas
**grandes** (Volumes e eventos por nota com raio) que exigem a API.

| peça                          | onde                                                                                                                    | uso aqui                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| a nota e o "Detalhes da nota" | `modules/trip/components/TripStopList.component.tsx` (`TripStopCard`, item da nota)                                     | vira o acordeão                            |
| comprovante aberto, exclusivo | `workspace.openProofDocumentId` em `useTripWorkspace.hook.ts`; alternado em `TripDetail.component.tsx`                  | candidato a "nota aberta" (D1)             |
| card do comprovante           | `TripDeliveryProof.component.tsx`, `ProofReadings.component.tsx`, `ProofReviewChip.component.tsx`                       | seção _Comprovante_                        |
| ocorrências                   | `TripOccurrences.component.tsx`, hoje dentro de `TripDeliveryProofDetail.component.tsx`                                 | seção _Ocorrências_                        |
| linha do tempo e mapa         | `TripTimeline.component.tsx`, `TripTimelineLocation*.component.tsx` (spec 196)                                          | seção _Eventos_                            |
| custo e lucro                 | `modules/trip-financials/components/TripDocumentCost.component.tsx` (spec 226)                                          | entra em _Dados da nota_                   |
| copiar                        | `src/components/ui/copy-button.tsx`                                                                                     | RF4                                        |
| navegação                     | `tripRoute.service.ts`, `tripOccurrenceRoute.service.ts`, `tripNavigation.service.ts`, `workspaceNavigation.service.ts` | RF6, RF8                                   |
| seleção por checkbox          | `hooks/useTripDocumentSelection.hook.ts`                                                                                | **não pode quebrar** (RF1)                 |
| dados da nota                 | `GET /trips/:id` → `serializeTripDocumentDetail` (`trip.routes.ts`), `FieldPolicy` exaustiva                            | CNPJ já vem (`contact.taxId`); Volumes não |

## Fatias e dependências

```
F0 chão  ──►  F1 acordeão ──►  F2 dados da nota ──►  F6 comparação
   │              │                  │
   │              ├──►  F3 ocorrências ─────────────►─┤
   │              │                                    │
   │              └──►  F4 comprovante  (N1) ─────────►┤
   │                                                   │
   └─────────────────►  F5 eventos + raio (228, 206) ──┘
```

F1 a F4 **não dependem** de pergunta em aberto nem de spec aberta (todas foram respondidas). F5 espera a **spec 228**
(os dois eventos novos) e a spec 206.

## Arquitetura e arquivos afetados

### F0 — O chão

- `git mv specs/225-… specs/226-…` e **todas** as referências: `Spec 225`/`spec 225`/`(225 …)` em código,
  testes, `docs/ai-context/*`, locales, e a própria pasta de prints. Mecânico, com `grep` antes e depois;
  mensagens de commit já feitas **não** se reescrevem.
- Rebase em `origin/staging`. Conflitos esperados nos 12 arquivos medidos (spec D0).
- Migration da spec 196: **renomear a pasta** para um timestamp **posterior** ao último de staging, e
  **regerar o `snapshot.json` a partir do snapshot de staging**. Procedimento: apagar o meu `snapshot.json`,
  rodar `db:generate` (cria uma pasta nova com o diff = as minhas colunas), **trocar** o `migration.sql` dela
  pelo meu, escrito à mão, mover o `rollback.sql`, apagar a pasta antiga, atualizar a lista exaustiva em
  `static-migration.contract.ts`. Fecha com `db:generate` = `no_changes` e **`make migration-test`**.

### F1 — Acordeão (só painel)

- Estado de "nota aberta" compartilhado, em `useTripWorkspace.hook.ts` (reaproveitando `openProofDocumentId`
  **ou** novo `openDocumentId` — decisão da T1.1, justificada pelas três buscas que o primeiro dispara).
- `TripStopList.component.tsx` perde os três `useState` locais de expansão; o cabeçalho vira
  checkbox **+** botão irmãos (não aninhados).
- Âncora da linha do tempo abre a nota (`tripTimelineLink.service.ts`).
- Contrato `test/trip/document-row-structure.contract.ts` (spec 181 T202) **atualizado**, e um novo para o
  estado exclusivo.

### F2 — Dados da nota

- Série separada do número (`tripDocument.service.ts`); CNPJ de `contact.taxId` (formatador do painel);
  `CopyButton` por campo; o bloco de custo e lucro muda para dentro de _Dados da nota_.
- **API (tarefa própria, só se N4 = sim)**: `volumeCount` em `serializeTripDocumentDetail`, classificado em
  `TRIP_DOCUMENT_DETAIL_FIELD_POLICY`, lido de `nfe_volumes.quantity` **sem** N+1.

### F3 — Ocorrências por nota

- `TripOccurrences` sai de dentro do comprovante e vira seção própria; cada item ganha `<a href>` +
  `onClick` + `navigateToTripOccurrence`. Cuidado com a spec 167 (mesma lista).

### F4 — Comprovante unificado (N1)

- Selo(s) de situação conforme N1; usa `GET /trips/:id/delivery-proofs` (spec 222, **só em staging**) para
  não fazer uma chamada por nota; encaixa o `proofPending` da 223 e as fotos da 224.

### F5 — Eventos da nota + raio (spec 228, spec 206)

- `GET /trips/:id/timeline` ganha filtro por nota **no servidor**; `TripTimeline` deixa de filtrar em memória.
- Raio: campo novo na resposta do comprovante, resolvido por contratante (N2, D6), sem `settings.manage` do leitor.
- Rótulo do `departed` conforme N3.

### Documentação

- `docs/ai-context/frontend-transportada.md` (e `api-transportada.md` se houver API): o acordeão, o estado
  compartilhado, e por que o checkbox fica fora do botão.

## Riscos e mitigação

1. **O rebase** — medido (12 arquivos); fatiado em F0 e feito **antes** de qualquer tela.
2. **Revogar a spec 181** — o contrato T202 é **atualizado**, e a spec 181 ganha uma nota apontando para a 227.
3. **Cinco políticas de permissão na mesma tela** — cada seção trata **a sua** ausência; um contrato por seção
   prova "sem permissão não aparece nem rótulo vazio".
4. **Transbordo em 375 px** — asserção `scrollWidth <= innerWidth` no smoke, desde a F1, não só no print.
5. **Cada fatia é commitável sozinha** — se F5 atrasar, F1–F4 saem sem ela.

## Estratégia de testes

- Contrato primeiro, em cada fatia, **provado por mutação**.
- Smoke de print `spec-227-prints.smoke.spec.ts` no molde da 181, em **1280 e 375**, **dark e light**, com a
  nota **aberta** (print de acordeão fechado não mostra nada) e com a ausência de cada permissão.
- Contrato de comparação com o canvas na F6: a **lista de divergências** é artefato, não opinião.
