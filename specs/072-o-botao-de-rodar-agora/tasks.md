# Tasks

> 🤖 Modelo da fase: `sonnet`.

- [x] T001 ✅ [P] Permissão `operations.run` no catálogo e no papel `admin` — `identity/domain/authorization.policy.ts` — evidência: contrato de papéis verde
- [x] T002 ✅ Contrato do disparo **antes** da implementação: cria manual com requester, recusa duplicado, não insere quando o broker falha — `test/operations/run-job.contract.ts` — evidência: vermelho pelo motivo certo
- [x] T003 ✅ Cópia por valor do envelope e da topologia de `job-run` na API, com contrato de paridade contra o worker — `src/operations/infrastructure/` — evidência: paridade assertada
- [x] T004 ✅ Use case + repositório: insere execução manual com `onConflictDoNothing` e publica — evidência: T002 verde
- [x] T005 ✅ Rota `POST /operations/jobs/:job/run` com `operations.run` — evidência: contrato HTTP
- [x] T006 ✅ Botão na tela de rotinas, com a recusa impressa — `frontend/src/modules/operations/` — evidência: contrato de tela
- [x] T007 ✅ `make check` + evidência
