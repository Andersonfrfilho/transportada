# Spec 152 — Tarefas

Revisão de 2026-09-15 (D13–D19 do `spec.md`): a medida pela câmera é construída agora, como
**experimental** e **desligada por padrão**. A sessão com caixas reais deixou de ser a Fase 1 e virou
a validação da Fase 7 (T15), que decide tirar o selo e ligar em produção (T16). Nenhuma outra tarefa
depende dela.

| fase | tasks               | modelo recomendado                     | fallback se der 429 |
| ---- | ------------------- | -------------------------------------- | ------------------- |
| 0    | T0 ✅               | `haiku`                                | `sonnet`            |
| 1    | T1 🧠 (ADR)         | `opus` (validar com `architect`)       | `fable`             |
| 2    | T2, T3, T4, T5      | `sonnet` (T2 revisada por `architect`) | `opus`              |
| 3    | T6 🧠               | `opus`                                 | `fable`             |
| 3    | T7, T8              | `sonnet`                               | `opus`              |
| 4    | T9, T10, T11, T12   | `sonnet`                               | `opus`              |
| 5    | T13                 | `haiku`                                | `sonnet`            |
| 6    | T14 (revisão)       | `opus`                                 | `fable`             |
| 7    | T15 🧠 (validação)  | `opus` — **precisa do usuário**        | `fable`             |
| 7    | T16 (selo/produção) | `sonnet` — **aprovação do usuário**    | `opus`              |

Cada task fecha com typecheck (`bun run typecheck`), lint (`bun run lint`), os testes da app
alterada, o arquivo de teste novo listado no `package.json` da app, a evidência em `evidence.md` e
um commit isolado. A integração da API roda com `bun --env-file=../../.env.test test --timeout
120000`, de dentro de `apps/api-transportada`: sem o `.env.test` ela pula, e pular não é passar.
Contrato/aceite **antes** da implementação em toda task de código.

## Fase 0 — Pré-requisito

> 🤖 Modelo: `haiku`

- [x] **T0 — O leitor novo está em `staging`.** Feito (evidence.md § T0: `1f61c4a5`, `3ae7d76b`).

## Fase 1 — Decisão registrada

> 🤖 Modelo: `opus` 🧠 (validar com `architect` antes de fechar)

- [ ] **T1 🧠 — ADR da medida pela câmera e dependência.** `docs/adr/0065-a-caixa-se-mede-com-cartao-e-nunca-grava-sozinha.md`
      (0065 é o próximo livre em `origin/staging`; conferir de novo, porque 0063 já saiu duplicado).
      Registra:
  - abordagem A vs WebXR vs monocular, com os números medidos no spike (WASM 11,96 MB / 3,50 MB
    gzip; chunk do Vite 15,5 MB / 3,90 MB gzip; `cv.aruco_ArucoDetector` presente; ~0,7 s de carga
    e 4,3 ms/quadro 720p no desktop);
  - `@techstark/opencv-js@5.0.0-release.1` com versão exata, arquivo único (`SINGLE_FILE`),
    carregado só num worker empacotado, pré-carga ao abrir o fluxo, fora do precache, `CacheFirst`
    próprio (D18); build próprio como alternativa;
  - por que não há diretiva nova de CSP (`'wasm-unsafe-eval'` e `worker-src 'self'` já existem;
    ADR-0042) nem de Permissions-Policy (`camera=(self)`);
  - pose em TS puro (desvio do plano original, vindo do spike);
  - experimental + interruptor por empresa + validação posterior (D13, D14, D16);
  - imagem não sai do aparelho; origem, margem e proposta gravadas.

  Instalar a dependência em `apps/frontend-transportada` com versão exata.
  **Aceite:** ADR com Status, Contexto, Decisão, Alternativas e Consequências;
  `bun install --frozen-lockfile` verde depois do lock atualizado; `make check` verde; nenhum import
  da dependência ainda no código.

## Fase 2 — API: origem, margem, histórico, interruptor e export

> 🤖 Modelo: `sonnet` (T2 revisada por `architect` antes do commit: migration)

- [ ] **T2 — Migration aditiva e schema.** Timestamp posterior a
      `20260915025926_nfe_document_protocol_presence`, com `snapshot.json` e `rollback.sql`
      (`plan.md` § API): `measurement_source` + `measurement_margin_mm` em `nfe_package_boxes`;
      tabela `nfe_package_box_measurements` (com `proposed_*_mm`, D17) e índice;
      `company_cargo_settings.camera_measurement_enabled boolean not null default false`.
      **Aceite:** `make migration-test` verde (sobe e desce), contrato `schema-snapshot` verde,
      nenhuma coluna existente alterada, nenhum `DROP` fora do `rollback.sql`.
- [ ] **T3 — Rota de medida com origem, margem e histórico (teste antes).** Primeiro
      `test/nfe-package-box/measurement-source.contract.ts` e
      `test/integration/measurement-history.integration.ts`. Depois: `refine` do schema
      (`source` `typed` padrão · `camera` · `camera_adjusted`; bloco `camera` com margens, motivos,
      `impreciseConfirmed`, `engine` e proposta), `package-box-measurement.policy.ts` e o erro de
      domínio, use case com transação caixa + histórico e ator do contexto, repositório (`list`
      devolve origem e margem), constante de motivos com contrato de paridade, OpenAPI.
      **Aceite:** R5 do `spec.md` como teste; corpo antigo grava `typed`; tenant `404` sem
      histórico; integração com `.env.test` verde e contagem de testes igual ou maior.
- [ ] **T4 — Interruptor por empresa (teste antes).** Primeiro
      `test/company-settings/camera-measurement-flag.contract.ts` e
      `test/integration/camera-measurement-flag.integration.ts`. Depois:
      `PUT /company-settings/cargo/camera-measurement` (`settings.manage`),
      `cameraMeasurementEnabled` no `GET /company-settings/cargo`,
      `GET /nfe-package-boxes/measurement-settings` (`cargo.measure`, por porta), e o `422`
      `PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED` no use case de medida. **Aceite:** R7 como teste;
      ausência de linha = `false`; `403` sem permissão; resposta antiga do cargo intacta.
- [ ] **T5 — Export do histórico para a validação (teste antes).** Primeiro
      `test/integration/package-box-measurement-export.integration.ts`. Depois
      `GET /nfe-package-box-measurements?from=&to=&cursor=` (`settings.manage`, `perPage` ≤ 100).
      **Aceite:** R8 (lado da API) como teste; só a empresa do token; sem descrição do produto nem
      CNPJ; rota no documento OpenAPI.

## Fase 3 — Design system: motor, stream compartilhado e primitivo de medida

> 🤖 Modelo: `sonnet` (T6 é 🧠 — `opus`)

- [ ] **T6 🧠 — Motor puro de medida, portado do spike.** `boxDimension.service.ts` +
      `boxDimension.constant.ts` a partir de `spike/152-medir-caixa/src/{geometry,measurement,warnings}.ts`
      (homografia DLT, focal pela homografia com faixa física e `defaultFov`, pose, altura pela aresta
      vertical, Monte Carlo com semente, `classifyMeasurement`, `detectWarnings`). Os 16 testes do spike
      viram `test/nfe-workspace/box-dimension.contract.ts` **antes** do código, sem afrouxar asserção.
      `MARGIN_RELIABLE_MM = 10` e `MARGIN_UNRELIABLE_MM = 30` com o comentário "provisório até a
      validação (T15)". `markerAtEdge` entra como código interno do motor, fora do enum da API, até a
      validação decidir. **Aceite:** contrato verde (pose sintética < 1 mm, focal < 1 px, fronteiras
      10/30, cada código de D9, determinismo), constantes iguais às do spike, sem I/O no módulo.
- [ ] **T7 — `useCameraStream` e leitor com stream injetado (D19).** Extrair abrir/apagar/status/
      lanterna de `useBarcodeScanner` para `useCameraStream.hook.ts`; o leitor aceita `stream`
      opcional e, sem ele, mantém o comportamento atual. **Aceite:** `barcode-scanner.contract.ts`
      verde sem mudar asserção; contrato novo mostra que o stream injetado não é fechado pelo leitor
      e que `getUserMedia` é chamado uma vez num ciclo com o stream do pai.
- [ ] **T8 — Primitivo `box-dimension-scanner`, worker e carga (D18).** Componente, hook, CSS e
      `boxDimension.worker.ts` (OpenCV por `import()` dentro do worker, `preload()`, criado por
      `new URL`); indicador ao vivo, "Capturar", pontos arrastáveis com lupa e setas (portar
      `marking.ts` do spike); `onUnsupported` para `noWasm`/`engineFailed` (15 s)/`tooSlow`;
      `Skeleton` durante a carga. No `vite.config.ts`: chunk do OpenCV em `globIgnores` e
      `runtimeCaching` `CacheFirst` próprio. No `server.ts`: chunk comprimido (se já não sair).
      Criar `docs/frontend/box-dimension-scanner.md`, a linha na tabela do
      `apps/frontend-transportada/CLAUDE.md` e `test/design-system/box-dimension-scanner.contract.ts`.
      **Aceite:** o contrato verifica: sem `blob:`, OpenCV fora do chunk inicial e do manifest de
      precache, regra de runtime cache presente, vídeo apagado ao desmontar, nenhuma chamada de rede
      com imagem, props de texto obrigatórias; contrato de CSP e de headers **inalterados**;
      `make check` verde. Qualquer necessidade de mudar CSP/Permissions-Policy → **parar**.

## Fase 4 — Fluxo do conferente em `nfe-workspace`

> 🤖 Modelo: `sonnet`

- [ ] **T9 — Máquina de etapas.** `shared/packageBoxCameraFlow.service.ts` (reducer puro), com teste
      antes em `test/nfe-workspace/package-box-camera-flow.contract.ts`. Inclui o estado da função
      (ligada/desligada) e a pré-carga. **Aceite:** cobre R1 (0/1/N candidatas, voltar, gravado →
      etiqueta), R4 (`unsupported` e carga > 15 s → digitado da caixa lida) e R7 (desligada → sem
      etapa Medida).
- [ ] **T10 — Formulário com proposta, selo, aviso e confirmação.** Extrair
      `PackageBoxMeasurementForm.component.tsx`: `proposal`, margem ±cm por campo, aviso com texto +
      ícone + `role="alert"`, campo vazio acima de 30 mm, `camera_adjusted` ao editar, diálogo
      "Gravar medida imprecisa (±X cm)?", selo "Experimental" com o texto de D13
      (`CAMERA_MEASUREMENT_IS_EXPERIMENTAL`). Client manda `source`/`camera` (com proposta) e os
      guards aceitam `measurementSource`/`measurementMarginMm`. **Aceite:**
      `package-box-measurement.contract.ts` estendido com R2, R3, R5 (tela) e R8 (selo); nenhum `PUT`
      antes de Salvar; chaves novas nos dois locales, acentuadas.
- [ ] **T11 — `PackageBoxCameraFlow` na tela.** Diálogo de tela cheia com as etapas, instrução por
      etapa, "Voltar para a etiqueta", "Digitar medida", lanterna quando existir, próxima caixa em
      sequência, pré-carga ao abrir com a função ligada (`saveData` respeitado) e
      `useCameraMeasurementSettings`. "Ler etiqueta" do painel abre o fluxo; a linha medida mostra a
      origem. Entra também `MeasurementCardPrint.component.tsx` (cartão imprimível servido pelo app,
      ArUco `DICT_4X4_50` id 0 com 150 mm, régua de 100 mm, `@media print`, em mm, sem `<svg>` cru).
      **Aceite:** smoke Playwright com câmera falsa (`.y4m` de caixa com cartão) passa por etiqueta →
      medida → confirmar → gravar → etiqueta com `getUserMedia` chamado uma vez; com a função
      desligada, o mesmo smoke não pede o chunk do OpenCV; `panel-reveal`/`design-system` verdes;
      `make check` verde; verificação no navegador por texto (`read_page`), screenshot só no fim.
- [ ] **T12 — Painel do interruptor, export e resumo da validação.**
      `CameraMeasurementSettingsPanel.component.tsx` na aba `packageBoxes` (só `settings.manage`),
      registrado em `SETTINGS_PANELS`/`SETTINGS_PANEL_PLACEMENT` (`cameraMeasurement`), com o
      interruptor, o texto experimental, o export CSV do período e o resumo por
      `cameraMeasurementValidation.service.ts` (porta o `session.ts` do spike). Teste antes:
      `test/nfe-workspace/camera-measurement-settings.contract.ts` e `tabs.contract.ts` estendido.
      **Aceite:** R7 e R8 do lado da tela; resumo nas fronteiras 80%/90% e com margem otimista
      reprovando; CSV sem descrição do produto; `make check` verde.

## Fase 5 — Documentação viva

> 🤖 Modelo: `haiku`

- [ ] **T13 — Contexto da IA e docs.** Atualizar `docs/ai-context/frontend-transportada.md` e
      `docs/ai-context/api-transportada.md` (medida pela câmera experimental, interruptor, origem,
      histórico com proposta, export); o núcleo do `apps/api-transportada/CLAUDE.md` (a linha
      "Medir uma caixa é `cargo.measure`…" ganha origem, histórico e o `422` com a função
      desligada); `docs/frontend/barcode-scanner.md` (stream injetado); a seção "Configuração perto
      do efeito" do `apps/frontend-transportada/CLAUDE.md` (painel `cameraMeasurement`).
      **Aceite:** `bunx prettier --check` nos `.md` e os contratos que leem os CLAUDE.md verdes.

## Fase 6 — Revisão e publicação em staging

> 🤖 Modelo: `opus`

- [ ] **T14 — Revisão final, auditoria e staging.** `code-reviewer` (opus) sobre o diff inteiro;
      `security-reviewer` na rota, no export e no worker (imagem não sai, tenant, Zod `.strict()`,
      histórico append-only, CSV sem PII); auditoria do §15 do code-standart (N+1, I/O assíncrono,
      sem PII no log). Achados bloqueantes corrigidos. Com os gates verdes, publicar em `staging`
      (`git fetch && git rebase origin/staging && git push origin HEAD:staging`) e **ligar a função
      na empresa de staging pelo painel** (se o autopilot não tiver credencial de administrador do
      staging, pedir ao usuário). **Aceite:** evidência da revisão, do push e da leitura
      `cameraMeasurementEnabled: true` em staging no `evidence.md`.

## Fase 7 — Validação com caixas reais (depende do usuário)

> 🤖 Modelo: `opus` 🧠 (T15) · `sonnet` (T16)

- [ ] **T15 🧠 — Validação com caixas reais em staging.** Pedir ao usuário a sessão: ≥ 20 caixas
      reais (30–80 cm), 2 aparelhos (Android médio e iPhone), 2 condições de luz, cartão impresso
      pelo app e conferido pela régua, seguindo o protocolo de D16 (digitar a fita em todos os campos
      depois da proposta). Colar no `evidence.md` o CSV do export, o resumo do painel e os tempos por
      aparelho (carga do OpenCV frio e quente, quadro ao vivo, captura). **Aceite:** tabela por
      dimensão e o veredito:
  - **Go** (≤ 10 mm em ≥ 80% **e** dentro da margem em ≥ 90%) → T16;
  - **No-go** → relatório por dimensão, aparelho e motivo, função segue experimental e desligada
    em produção, próxima ação volta ao usuário;
  - recalibrar `MARGIN_*` ou os parâmetros de incerteza: apertar pode; **afrouxar exige o ok do
    usuário**.
- [ ] **T16 — Tirar o selo e ligar em produção.** Só com o go da T15. `CAMERA_MEASUREMENT_IS_EXPERIMENTAL
= false` (e os contratos do selo invertidos), comentário "provisório" removido dos limites
      validados, ADR-0065 atualizada com os números reais. Ligar a função na empresa de produção é
      **decisão do usuário** e segue a regra de deploy em produção (gates + aprovação humana).
      **Aceite:** `make check` verde, evidência do go, aprovação do usuário registrada.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/152-medir-caixa-pela-camera/ (leia spec.md, plan.md,
tasks.md e evidence.md antes de começar; leia também CLAUDE.md, AGENTS.md,
apps/frontend-transportada/CLAUDE.md e apps/api-transportada/CLAUDE.md). A medida pela câmera é
EXPERIMENTAL e desligada por padrão (D13–D19): não espere a sessão com caixas reais para construir.
Trabalhe num worktree próprio (make worktree NAME=spec-152) e só nele; nunca use git stash. Uma task
por vez, na ordem do tasks.md, de T1 a T14.
Modelos: T1 🧠 ADR-0065 + dependência → opus (validar com architect) · Fase 2 (T2–T5) → executor
model=sonnet (T2 migration revisada por architect antes do commit) · T6 🧠 motor portado do spike →
opus · T7–T8 → executor model=sonnet · Fase 4 (T9–T12) → executor model=sonnet · Fase 5 (T13) →
executor model=haiku · T14 revisão → code-reviewer model=opus + security-reviewer · T15 🧠 → opus ·
T16 → executor model=sonnet.
Teste de contrato/aceite antes da implementação. Cada task fecha com: bun run typecheck + bun run lint
+ testes da app alterada (integração da API com bun --env-file=../../.env.test test --timeout 120000,
de dentro de apps/api-transportada — pular não é passar) + arquivo de teste novo listado no
package.json da app + commit isolado da task + evidência em
specs/152-medir-caixa-pela-camera/evidence.md.
Quando os gates passarem, publique em staging sem perguntar (git fetch && git rebase origin/staging
&& git push origin HEAD:staging) e, na T14, ligue a função na empresa de staging pelo painel (peça ao
usuário se não tiver credencial de administrador do staging).
Pare e pergunte antes de: qualquer mudança de CSP ou Permissions-Policy; migration destrutiva;
deploy ou ligar a função em produção; publicar pacote; afrouxar MARGIN_RELIABLE_MM /
MARGIN_UNRELIABLE_MM ou qualquer limite de precisão; qualquer [NEEDS CLARIFICATION] novo. T15 precisa
da sessão do usuário com caixas reais (2 aparelhos, 2 luzes, ≥ 20 caixas): peça e espere; T16 só com
o go da T15 e a aprovação do usuário.
```
