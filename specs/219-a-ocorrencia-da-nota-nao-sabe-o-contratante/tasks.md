# Tasks

> 🤖 Modelo: `sonnet` (execução mecânica sobre uma resolução que a spec 218 já provou — sem task 🧠)

- [x] T1 Backend, contrato antes: estender o teste de integração da 218
      (`test/integration/me-trip.integration.ts`, "o override de contratante muda o comprovante
      efetivo...") com asserções `contractorId`/`recipientTaxId` nos documentos já usados no
      cenário — visto falhar.
- [x] T2 Backend: `DriverTripDocument` ganha os dois campos opcionais
      (`find-current-driver-trip.use-case.ts`); `toDriverDocument` os popula
      (`drizzle-current-driver-trip.repository.ts`). T1 verde.
- [x] T3 [P] Frontend, contrato antes: `occurrence-registration.contract.ts` prova a query string
      de `listOccurrenceTypes({ contractorId, recipientTaxId })` — visto falhar (assinatura não
      aceita o parâmetro).
- [x] T4 Frontend: `DriverTripDocument` (cópia por valor) ganha os dois campos opcionais
      (`driverTrip.types.ts`); `listOccurrenceTypes` aceita o parâmetro opcional e monta a query
      string (`driverTripClient.service.ts`). T3 verde.
- [x] T5 [P] Frontend, contrato antes: tabela de casos da função pura de mescla de
      `attachmentMode` em `occurrenceRegistration.service.ts` (com overlay, sem overlay, tipo
      ausente na resposta por nota) — visto falhar (função não existe).
- [x] T6 Frontend: implementa a função pura de mescla. T5 verde.
- [x] T7 Frontend, contrato antes: estende `occurrence-registration-wiring.contract.ts` provando
      que `useOccurrenceRegistrationForm.hook.ts` chama `listOccurrenceTypes` com os campos do
      `document` e usa a função pura de T6 (nunca reimplementa) — visto falhar.
- [x] T8 Frontend: implementa a busca por nota no hook (uma vez por abertura, sem bloquear a tela,
      sem overlay em falha/ausência — RF4/P3/P4). T7 verde.
- [x] T9 Gates: `bun run check` nas duas apps + `bun run test:integration` da API (T1/T2).
      Evidência em `evidence.md`.
- [x] T10 Revisão de design (web.md §15) — sem tela nova nem layout novo (a lista já existia), só
      confirmar que o `attachmentMode` corrigido aparece no smoke existente do formulário único
      (spec 218 T20); sem print novo se o smoke não muda de asserção.

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos arquivos. Marque como
concluída apenas após registrar evidência.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/219-a-ocorrencia-da-nota-nao-sabe-o-contratante/
(leia spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelo: executor model=sonnet em todas as tasks (mecânica sobre resolução já provada na spec 218).
Cada task fecha com o contrato correspondente verde + typecheck, evidência em evidence.md.
Pare e pergunte antes de: reconciliar a branch com origin/staging, qualquer [NEEDS CLARIFICATION].
```
