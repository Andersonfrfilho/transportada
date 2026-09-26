# Tasks — Spec 194

**👤 = ação humana.** O executor para, descreve o passo exato, espera o "feito" e confere o efeito.
**🧠 = task que sobe para `opus`** dentro de uma fase mais barata.

| Fase | Assunto                                   | Modelo                          | Depende de                                             |
| ---- | ----------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| 1    | Qualidade da foto, grava primeiro         | `sonnet`                        | task do `attach` em `origin/staging`; T1.2b 👤         |
| 2    | Número da NF-e (OCR)                      | `sonnet`; T2.2 e T2.4 🧠 `opus` | fase 1; 196 e 192 no `useDriverTrip`/página, ou rebase |
| 3    | Assinatura no canhoto                     | `sonnet`                        | fase 1                                                 |
| 4    | Metadado na API (**opcional**, migration) | `sonnet`; T4.1 🧠 `opus`        | T4.0 👤; migration da 193 em `origin/staging`          |
| 5    | Fechamento, segurança, validação de campo | `sonnet`; T5.2 `opus`           | fases 1–3                                              |

A fase 3 pode correr em paralelo à 2 (arquivos diferentes, salvo a lista de motivos, que a 3 só
acrescenta). A coordenação por arquivo com 192/193/195/196 está no `plan.md`.

Toda task de comportamento começa pelo contrato ou teste, **visto vermelho**, e fecha com:

- `bun run typecheck`, `bun run lint` e os testes da app tocada
  (`bun run --cwd apps/frontend-driver test`; o `build` roda o `dist.contract`);
- na API, os **dois** comandos, de dentro de `apps/api-transportada`:
  `bun --env-file=../../.env.test test --timeout 120000` e
  `bun --env-file=../../.env.test run test:integration`;
- suíte nova importada no entrypoint da área (`test/driver-trip.contract.test.ts`,
  `test/shared.contract.test.ts`). Na API, contrato novo na lista de `scripts.test` (conferida por
  `test/test-registry/declaration.contract.ts`) e **integração nova em `scripts["test:integration"]`**,
  que o registro não confere — a evidência é a saída do comando mostrando o arquivo novo rodando;
- evidência no `evidence.md`;
- commit isolado, com `--no-verify` e caminhos explícitos (o hook de pre-commit varre a árvore).

**Regra do usuário para tela:** toda mudança visível roda primeiro no **preview local** — motorista em
`http://localhost:53200` com a API de demonstração do scratchpad da sessão
(`/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-pensive-borg-f59971/bb453e02-a58a-48b5-833a-3401376ec42e/scratchpad/driver-preview-api.ts`;
se não existir mais, recriar o equivalente a partir de `driverTripResponse.validation.ts`) — e só sobe
depois de o usuário ver.

**Sem migration nas fases 1–3.** Nenhum limiar vai a staging antes da T1.2b. Produção só depois da T5.4.

---

## Fase 1 — Qualidade da foto, grava primeiro

> 🤖 Modelo: `sonnet`

- [ ] **T1.0 — Base e pré-requisito.** `git fetch && git rebase origin/staging &&
bun install --frozen-lockfile`. Conferir: (a) a task do `attach` que descarta a foto
      (`DriverStopCard.component.tsx:549-555`) está em `origin/staging` — se não, **parar e avisar**;
      (b) os três botões de `6aef92ab6` e o `onConfirm` do `ProofCrop`; (c) `ls specs/` por 197/198 e
      por mudanças de 192/193/195/196 nos arquivos da tabela de coordenação — atualizar a tabela se
      algo mudou. Evidência: hash da base e o resultado de (a)–(c).
- [ ] **T1.1 — Fixtures e contrato da qualidade (vermelho).** `test/fixtures/canhoto-grid.fixture.ts`
      (`buildCanhotoGrid` com ruído de amplitude > 30, fundo claro nas laterais e sombra; `blurGrid`,
      `scaleGrid`, `compressContrastGrid`, `saturateGrid`, `noiseGrid`, `cutTextGrid`,
      `fillFrameGrid`) e `test/driver-trip/proof-photo-quality.contract.ts`, nos dois sentidos: nítida
      → `[]`; papel ocupando 98% do quadro → `[]`; papel com mesa clara na lateral → `[]`; tremida →
      `['blurry']` (nitidez medida na janela nativa); escura → `['tooDark']`; apagada →
      `['lowContrast']`; estourada → `['overexposed']`; ruído cinza → `['noDocument']`; texto cortado
      nas duas laterais → `['documentCut']`; escura + tremida → os dois, na ordem fixa; lado menor < 64
      px não avalia nitidez; um pixel de reflexo não muda o veredito (percentis). Evidência: vermelho.
- [ ] **T1.2 — Serviço puro.** `proofPhotoCheck.constant.ts` (com `PROOF_PHOTO_CHECK_ENABLED`),
      `proofPhotoCheck.types.ts`, `proofPhotoQuality.service.ts` (plan.md § Fase 1). Sem tocar em
      `proofCrop.service.ts`. Evidência: T1.1 verde.
- [ ] **T1.2b 👤 — Calibração com fotos reais.** `scripts/calibrate-proof-photo.ts` (plan.md). Pedir
      ao usuário **≥ 40 fotos reais** de canhoto tiradas no celular (boas e ruins, pelo menos 2
      aparelhos e 2 luzes) numa pasta local fora do Git, com o CSV `arquivo,boa|ruim,motivo`. Rodar,
      ajustar os limiares no `*.constant.ts` e colar no `evidence.md` a matriz de confusão por motivo e
      a varredura. **Aceite:** aviso em ≤ 20% das fotos boas. Não atingiu → parar e mostrar ao usuário
      (desligar o motivo que falha ou recalibrar).
- [ ] **T1.3 — A fila substitui numa escrita só.** Contrato vermelho em
      `test/driver-trip/offline-attachments.contract.ts`: `replaceQueuedProof` acrescenta a nova e
      remove a anterior da mesma nota e tipo, ainda não enviada, na mesma `update`; anterior já enviada
      → só acrescenta; falha na escrita → a anterior fica. `attachProof` aceita `replacesAttachmentKey?`
      e devolve `{ outcome, attachmentKey? }`; `handleProof` e `onProof` ajustados sem mudar a tela.
      Evidência: testes, typecheck.
- [ ] **T1.4 — O seletor abre por handle.** `FilePickerButton` ganha `pickerRef` com `{ open(): void }`
      (`useImperativeHandle`, `input.click()` síncrono), sem mexer no `RefCallback` da câmera. Contrato:
      o handle chama `click()` no mesmo tique e o registro `'camera'` abre como no toque direto.
- [ ] **T1.5 — Fluxo puro e registro.** `proofPhotoCheckFlow.service.ts` e `'proof-check'` em
      `CAPTURE_KINDS`. Contratos vermelhos em `test/driver-trip/proof-photo-check-flow.contract.ts`:
      "a foto entra na fila antes da verificação" (ordem `open('proof-check')` → `attach` →
      desmontar); "atualização do SW pedida durante a checagem espera" (o `onIdle` do
      `serviceWorkerUpdate` não dispara com `proof-check` aberto, e dispara ao fechar); "cancelar a
      câmera depois de Tirar outra não perde a foto"; `decodeFailed` → `skipped`; frase de pontualidade
      só com a parada concluída; `PROOF_PHOTO_CHECK_ENABLED = false` → nada roda.
- [ ] **T1.6 — Tela.** `proofPhotoRaster.service.ts`, `useProofPhotoCheck.hook.ts`,
      `ProofPhotoCheckNotice.component.tsx`, inserção na `DeliveryProofSection` (origem guardada no
      `onSelect`; `onConfirm` → hook; aviso abaixo da miniatura "Anexada"; "Tirar outra" →
      `pickerRef.open()` da mesma origem; "Manter" some o aviso; prop `stopCompleted`), locales pt-BR/en
      (`proofCheck.*`), CSS com tokens. `touch-target` e `capture-registry` verdes. Evidência: testes,
      typecheck, lint.
- [ ] **T1.7 — Smoke e tempo.** Em `test/driver-app.smoke.spec.ts`, imagens desenhadas na página: foto
      nítida → "Anexada" sem aviso; tremida → "Anexada" + aviso; "Manter" some; "Tirar outra" reabre o
      seletor da mesma origem (câmera e galeria). Medir com `Emulation.setCPUThrottlingRate` 6× o
      `createImageBitmap` de uma foto de 12 MP + análise, e anotar (sem asserção de milissegundos).
- [ ] **T1.8 👤 — Preview local.** Motorista em 53200 + API de demonstração; prints 375 e 768 px (foto
      boa, um motivo, três motivos, parada concluída com a frase de pontualidade); revisão contra os
      vizinhos (botões da seção, `DriverProofOutcomeNotice`); enviar ao usuário e **esperar "pode
      subir"**.
- [ ] **T1.9 — Publicar a fase 1 em staging.** Só com T1.2b e T1.8 fechadas. fetch → rebase
      `origin/staging` → install → `make check` → push, encadeado com `&&`. Prettier nos `.md`.

## Fase 2 — Número da NF-e (OCR)

> 🤖 Modelo: `sonnet` (T2.2 e T2.4 são 🧠 — `opus`, com o `architect` validando antes de implementar)

- [ ] **T2.1 — O interruptor chega ao motorista.** API: contrato vermelho de `GET /me/trips/current`
      com `data.canhotoOcrEnabled`; integração de isolamento (empresa A ligada, B desligada) em
      `test/integration/`, registrada em `scripts["test:integration"]` (saída do comando com o arquivo
      no `evidence.md`); implementar no repositório e no caso de uso; corrigir o comentário da policy.
      App: parser (`false` para ausente/inválido) + contrato; `snapshot()` da API de demonstração com
      `canhotoOcrEnabled: true`.
- [ ] **T2.2 🧠 — Plataforma do motor (ADR-0078 §5 e §6).** Primeiro a **sonda da CSP no worker**:
      build com `script-src 'self'` no documento e `'wasm-unsafe-eval'` só nas respostas de
      `/canhoto-ocr/<versão>/`, lido no Chromium e no WebKit do Playwright, ouvindo
      `securitypolicyviolation`; registrar o resultado e escolher a forma. Depois, contratos vermelhos:
      `dist.contract.test.ts` (precache ≤ 1,5 MiB; nenhuma URL do precache casa `canhoto-ocr`;
      `tesseract` no precache só `assets/tesseract-ocr-*.js`, ≤ 32 KB; **fora de
      `canhoto-ocr/<versão instalada>/`** e desse chunk nenhum arquivo casa `canhoto-ocr|tesseract`;
      `opencv|background-removal|maplibre|pdfjs` em nenhum; `index.html` sem `modulepreload` do
      Tesseract); `service-worker.contract.ts` (navegação + `CacheFirst` restrita ao prefixo
      versionado da própria origem; sem `sync`; sem cache de API; `vite.config` sem `runtimeCaching`);
      `content-security-policy.contract.ts` (a forma escolhida); `canhoto-ocr-assets.contract.ts`
      (versões exatas, versão do caminho = instalada, `.br`/`.gz` + imutável, licenças, sem
      `trustedDependencies`). Então: dependências exatas, cópias (`fetch-canhoto-ocr.ts`,
      `canhotoOcrVersion.constant.ts`) no mapa do `copy-by-value-header`, `prebuild`/`predev`,
      `.gitignore`, `vite.config.ts`, `sw.ts`, `server.ts`, CSP, `apps/frontend-driver/CLAUDE.md` e os
      cabeçalhos "Emendada por: ADR-0078" já feitos em 0069/0075 conferidos. Medir precache, chunk
      inicial e **tempo do `prebuild` com brotli** (dentro do teto de ~180 s do smoke e do job da CI).
      Evidência: `bun run --cwd apps/frontend-driver build` verde, números no `evidence.md`,
      `make check`.
- [ ] **T2.3 — Comparação pura.** Contrato vermelho `test/driver-trip/canhoto-number-check.contract.ts`
      com listas de palavras: nota do comprovante → `matched`; outra da parada → `otherStopDocument`;
      inexistente → `mismatch` com lido e esperado formatados; sem rótulo / fora do formato / abaixo da
      confiança → `unread`; zeros à esquerda; série que não bate → `mismatch`; mesmo número em duas
      notas sem série → `unread`. Implementar `canhotoOcr.service.ts` (cópia da extração) e
      `canhotoNumberCheck.service.ts`.
- [ ] **T2.4 🧠 — Leitura depois do aceite.** `canhotoOcrEngine.service.ts` por cópia + prazo total de
      20 s desde o aceite (carga + leitura) + `saveData` + `prefetchCanhotoOcrAssets`;
      `canhotoOcrImage.service.ts` (≤ 2000 px, giros para tira vertical); `useCanhotoNumberChecks.hook.ts`
      no nível da página (dispara com `outcome === 'queued'` e `attachmentKey`; descarta chave velha ou
      prazo estourado; nunca lança); `CanhotoNumberNotice.component.tsx`; props novas no
      `DriverStopCard` (`canhotoNumberChecks`, `onRetakePhoto`); linha informativa em
      `DriverPendingProofs.page.tsx` (fora da `DeliveryProofSection`, que desmonta); pré-carga ao abrir
      a viagem; locales; texto do interruptor no painel + o contrato do painel. Contratos: prazo com
      relógio falso, descarte por chave trocada, pendências sem "Tirar outra".
- [ ] **T2.5 — Smoke do OCR.** Canhoto sintético em canvas (`NF-e Nº 000.900.101 SÉRIE 1`): certo →
      "Número confere"; outro → aviso; zero `securitypolicyviolation`; **recarregar a página** (o worker
      é singleton por aba) e `context.setOffline(true)` antes da segunda leitura, que tem de funcionar.
- [ ] **T2.6 👤 — Preview local.** Prints 375/768 (confere, outra da parada, outra qualquer, pendência
      informativa), tempo da primeira carga e das seguintes; o usuário vê antes de subir.
- [ ] **T2.7 — Publicar a fase 2 em staging** (sequência da T1.9). O interruptor segue desligado em
      todo ambiente; ligar é decisão do usuário.

## Fase 3 — Assinatura no canhoto

> 🤖 Modelo: `sonnet`

- [ ] **T3.1 — Contrato (vermelho).** `test/driver-trip/canhoto-signature.contract.ts` com as
      fixtures da T1.1: traço na célula → `present`; célula vazia → `absent`; só o rótulo → `absent`;
      bordas de tabela → `absent`; ruído de papel sem traço → `absent`; tira vertical ou quadrada →
      `inconclusive`.
- [ ] **T3.2 — Serviço puro.** `canhotoSignature.service.ts` + constantes; `signatureMissing` em
      `assessProofPhotoQuality`. Rodar o `calibrate-proof-photo.ts` sobre as fotos da T1.2b que são
      tira horizontal e anotar a matriz da assinatura.
- [ ] **T3.3 — Tela e smoke.** Motivo com selo "Experimental"; smoke com tira sem assinatura → motivo;
      com traço → sem motivo.
- [ ] **T3.4 👤 — Preview local**, prints 375/768, "pode subir"; publicar (sequência da T1.9).

## Fase 4 — Metadado na API (opcional)

> 🤖 Modelo: `sonnet` (T4.1 é 🧠 — `opus`)

- [ ] **T4.0 👤 — Aprovação.** Perguntar ao usuário se o escritório deve ver o resultado das
      verificações (exige migration). Sem "sim", a fase 4 não começa.
- [ ] **T4.1 🧠 — Migration aditiva**, depois da `delivery_proof_received_by` da 193 estar em
      `origin/staging` (ou no mesmo lote, combinado com quem executa a 193): colunas do plan.md,
      `rollback.sql`, `snapshot.json`, número conferido em `origin/staging`, `make migration-test`,
      `db:generate` = `no_changes`.
- [ ] **T4.2 — Rota.** Contrato vermelho do multipart com os campos opcionais (vocabulário fechado,
      400 com todos os erros); gravar; integração (substituta sobrescreve; tenant isolado) em
      `scripts["test:integration"]`. O multipart continua com `latitude`/`longitude` (spec 196).
- [ ] **T4.3 — A fila leva os códigos.** `QueuedAttachment` + `attachProof`; contrato de
      `offline-attachments`.
- [ ] **T4.4 — O painel mostra**, coordenado com a 193; preview do painel, prints e 👤.

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet` (T5.2 → `security-reviewer` `opus`)

- [ ] **T5.1 — Revisão de design** (`designer`, `sonnet`): todos os estados em 375/768, contraste,
      consistência com os vizinhos; prints ao usuário; divergência consertada ou registrada.
- [ ] **T5.2 — Revisão de segurança** (`security-reviewer`, `opus`): CSP (forma escolhida), rota de
      cache do SW, nada saindo do aparelho, isolamento do interruptor; entrada em `docs/SECURITY.md`
      com `'wasm-unsafe-eval'` na app do motorista.
- [ ] **T5.3 — Documentação viva.** `apps/frontend-driver/CLAUDE.md` (fluxo "grava primeiro, avisa
      depois", `proof-check`, `replaceQueuedProof`), `docs/ai-context/frontend-driver.md`,
      `apps/api-transportada/CLAUDE.md` se o snapshot mudou; ADR-0078 para "aceita".
- [ ] **T5.4 👤 — Validação de campo.** Com o usuário, em staging, 2 celulares e 2 luzes:
  - **Qualidade:** ≥ 40 fotos novas (fora das da T1.2b). **Go:** aviso em ≤ 20% das boas e em ≥ 80%
    das ruins.
  - **OCR:** ≥ 50 canhotos reais de ≥ 3 emitentes, com uma viagem de notas consecutivas (protocolo da
    ADR-0069 §6, agora no motorista), anotando nota verdadeira, número lido e o que a app mostrou.
    **No-go imediato:** qualquer "Número confere" em nota errada. **Go:** `mismatch` falso em ≤ 2 dos
    50 (≈ 4%) e leitura conclusiva em ≥ 60%. Se a validação de 50 canhotos do painel (ADR-0069 §6)
    ainda não foi feita, esta a absorve para o painel também.
  - **Assinatura:** ≥ 20 canhotos assinados, ≥ 10 em branco, ≥ 5 carimbados. **Go:** `absent` falso em
    ≤ 10% dos assinados.
  - Recalibrar os limiares; o selo "Experimental" do OCR e da assinatura só sai com decisão do usuário;
    **produção só depois desta task**.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/194-o-canhoto-se-confere-no-aparelho/ (leia spec.md,
plan.md — inclusive a tabela de coordenação —, tasks.md, docs/adr/0078-o-canhoto-se-confere-no-aparelho-e-so-avisa.md,
ADR-0069, ADR-0070, ADR-0075 §4–§5 e apps/frontend-driver/CLAUDE.md antes de começar). Uma task por
vez, na ordem do tasks.md, numa branch na própria árvore a partir de origin/staging — nunca `make
worktree`. T1.0 primeiro: se a task que corrige o `attach` que descarta a foto
(DriverStopCard.component.tsx:549-555) não estiver em origin/staging, pare e avise.
Regra central (ADR-0078 §1): grava primeiro, avisa depois — a foto vai para o IndexedDB no onConfirm do
ProofCrop, com 'proof-check' aberto antes de desmontar o recorte; nenhuma verificação segura a foto em
memória; "Tirar outra" substitui numa escrita só.
Modelos: Fase 1 → executor model=sonnet · Fase 2 → executor model=sonnet, exceto T2.2 🧠 e T2.4 🧠 →
opus (validar com architect model=opus antes de implementar) · Fase 3 → executor model=sonnet · Fase 4
só com o "sim" do usuário na T4.0: executor model=sonnet, T4.1 🧠 → opus · T5.1 → designer model=sonnet
· T5.2 → security-reviewer model=opus · T5.3 → executor model=sonnet · revisão final → code-reviewer
model=opus.
Cada task fecha com typecheck + lint + testes + commit isolado (--no-verify, caminhos explícitos),
evidência em evidence.md. O build do motorista roda o dist.contract. Na API, os DOIS comandos (contrato
e `bun --env-file=../../.env.test run test:integration`, de dentro de apps/api-transportada); integração
nova vai em scripts["test:integration"] e a saída mostrando o arquivo rodando vai para o evidence.
Suíte nova importada no entrypoint da área. Contrato visto vermelho antes da implementação. Nenhuma
asserção de milissegundos em CI. Prettier nos .md antes de cada push.
Tasks 👤 (T1.2b, T1.8, T2.6, T3.4, T4.0, T5.4): pare, descreva o passo exato e espere "feito"/"pode
subir". Nenhum limiar vai a staging antes da T1.2b; nada vai a produção antes da T5.4.
Sem migration nas fases 1–3. Pare e pergunte antes de: a fase 4, qualquer migration, ligar o
interruptor canhoto_ocr_enabled em qualquer ambiente, deploy em produção, qualquer [NEEDS
CLARIFICATION]. Staging: fetch → rebase origin/staging → install → gates → push, encadeado com &&, só
depois do "pode subir" do usuário.
```
