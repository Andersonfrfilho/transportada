# Tasks — spec 295

## Fase 1 — API própria foto
> 🤖 Modelo: `sonnet`

- [ ] T1.1 Contrato `test/me-picture.contract.test.ts` (positivos + negativos: sem id externo, mime/tamanho/vazio → 400, 404 sem foto, 401) e registro no `package.json`.
- [ ] T1.2 Constante, `me-picture.routes.ts` e montagem no `main.ts`.

## Fase 2 — App do motorista
> 🤖 Modelo: `sonnet`

- [ ] T2.1 Teste de compressão/cliente + serviços copiados e cliente `/me/picture` + query.
- [ ] T2.2 `DriverAvatar`, Perfil (trocar/remover), cabeçalho e conversas; locale pt/en; teste e build.

## Fase 3 — Documentação viva
> 🤖 Modelo: `haiku`

- [ ] T3.1 Atualizar `apps/api-transportada/CLAUDE.md`, `apps/frontend-driver/CLAUDE.md` e o `CLAUDE.md` da raiz (uma linha).

## Fase 4 — Foto sugerida da CNH (BLOQUEADA, não implementar)
> 🤖 Modelo: `opus` (T4.1 🧠), depois `sonnet`

⚠️ `[NEEDS CLARIFICATION]` modo de consentimento (sugerir e confirmar × aplicar direto). Sem resposta, parar.

- [ ] T4.1 🧠 Spike: extrair o rosto de amostras reais de CNH em staging (PDF digital e foto), medir taxa de sucesso, escolher biblioteca compatível com Bun, sem serviço externo. Depende da 048.
- [ ] T4.2 Tabela aditiva de sugestão pendente + extração no cadastro (091/071).
- [ ] T4.3 App: confirmar ou trocar no primeiro acesso; painel mostra a sugestão.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/295-o-motorista-poe-a-propria-foto/ (leia spec.md, plan.md e tasks.md
antes de começar). Uma task por vez, na ordem do tasks.md. Só as Fases 1 a 3.
Modelos: Fases 1 e 2 → executor model=sonnet · Fase 3 → executor model=haiku · revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível e registra em evidence.md.
Cada task fecha com typecheck + lint + testes da app + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION] (a Fase 4 não entra).
```
