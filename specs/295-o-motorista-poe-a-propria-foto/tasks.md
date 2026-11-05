# Tasks — spec 295

## Fase 1 — API própria foto

> 🤖 Modelo: `sonnet`

- [x] T1.1 Contrato `test/me-picture.contract.test.ts` (positivos + negativos: sem id externo, mime/tamanho/vazio → 400, 404 sem foto, 401) e registro no `package.json`.
- [x] T1.2 Constante, `me-picture.routes.ts` e montagem no `main.ts`.

## Fase 2 — App do motorista

> 🤖 Modelo: `sonnet`

- [x] T2.1 Teste de compressão/cliente + serviços copiados e cliente `/me/picture` + query.
- [x] T2.2 `DriverAvatar`, Perfil (trocar/remover), cabeçalho e conversas; locale pt/en; teste e build.

## Fase 3 — Documentação viva

> 🤖 Modelo: `haiku`

- [x] T3.1 Atualizar `apps/api-transportada/CLAUDE.md`, `apps/frontend-driver/CLAUDE.md` e o `CLAUDE.md` da raiz (uma linha).

## Fase 4 — Foto da CNH aplicada direto (espera o spike)

> 🤖 Modelo: `opus` (T4.1 🧠), depois `sonnet`

Consentimento decidido: aplicar direto, com origem (`cnh|self|admin`) e nota no Perfil. Implementar só depois do resultado do T4.1.

- [x] T4.1 🧠 Spike: extrair o rosto de amostras reais de CNH em staging (PDF digital e foto), medir taxa de sucesso, escolher biblioteca compatível com Bun, sem serviço externo. Depende da 048.
      Resultado (05/11/2026, produção somente leitura) em `spike-cnh.md`: 18 motoristas sem foto, **1** com arquivo de CNH
      (CNH-e PDF, 1/1 extraído); 0 foto/digitalizado reais (sintético 9/12). O rosto da CNH-e está dentro da imagem do
      cartão: detecção também no PDF. Biblioteca: `onnxruntime-web` 1.23.2 (WASM, Alpine) + UltraFace RFB-320 + `pdfjs-dist`
      e `sharp` do worker. Protótipo em `apps/worker-transportada/spike/cnh-face/`. T4.2 rende só depois da 091 Fase 2.
- [ ] T4.2 Coluna aditiva `origin` (`cnh|self|admin`, VARCHAR) + extração no cadastro (091/071); `cnh` nunca sobrescreve `self`/`admin`.
- [ ] T4.3 App: nota "Foto tirada da sua CNH — toque para trocar" enquanto a origem é `cnh`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/295-o-motorista-poe-a-propria-foto/ (leia spec.md, plan.md e tasks.md
antes de começar). Uma task por vez, na ordem do tasks.md. Só as Fases 1 a 3.
Modelos: Fases 1 e 2 → executor model=sonnet · Fase 3 → executor model=haiku · revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível e registra em evidence.md.
Cada task fecha com typecheck + lint + testes da app + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION] (a Fase 4 não entra: espera o spike).
```
