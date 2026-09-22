# T16 — Revisão de design e usabilidade (web.md §15)

Escopo: só `apps/frontend-transportada/**`. A API não foi tocada; o que dependeria dela está
registrado no fim. Sessão de 2026-09-18, worktree `work/spec-156`.

## Como a tela foi vista

Sem Keycloak nem Docker, a mesma limitação da T8 à T15. A tela **real** foi montada assim: build de
produção (`VITE_SMOKE_AUTH_BYPASS=true bun run build`), `vite preview` na 53117, API mockada pelo
Playwright do repositório. O arquivo é `apps/frontend-transportada/test/spec-156-t16-prints.smoke.spec.ts`,
que fica fora do smoke da CI, e cobre uma viagem `on_delivery_route` com 10 notas (duas do mesmo
mercado), dois motoristas, `allowed-actions` com baixa e ocorrência, chave de acesso de cada nota e
catálogo de ocorrência. A câmera é o vídeo falso do Chromium, e os canhotos são PNGs gerados no
próprio navegador: código de barras Code128-C da chave, folha sem código e texto impresso para o OCR.

```
PLAYWRIGHT_TEST_MATCH=spec-156-t16-prints.smoke.spec.ts PLAYWRIGHT_FRONTEND_PORT=53117 \
PLAYWRIGHT_REUSE_EXISTING_FRONTEND_SERVER=true PLAYWRIGHT_REUSE_EXISTING_API_SERVER=true \
VITE_SMOKE_AUTH_BYPASS=true bunx playwright test          # 61 passed
```

`T16_PRINT_PREFIX=t16-antes` gerou o "antes", no desktop escuro e no celular claro, sobre o código
anterior a esta task. Cada teste também grava duas anotações: se há rolagem horizontal e quais
controles visíveis têm menos de 44 px.

O vídeo falso de 640×480 **cortava** a chave inteira: o Code128-C de 44 dígitos a 3 px por módulo
passa de 800 px. Por isso a câmera nunca "lia" nada no smoke. `writeFieldDeliveryBarcodeVideo`
ganhou um tamanho opcional, e o padrão continua 640×480, então o smoke da T12 não muda.

## Achados já listados na task (T8/T9): conferidos

| Achado                                             | Situação                                                                                                                                                                                                                                                                                                                                                                              | Print                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Borda cobre do painel "Ações de campo" (T8)        | Corrigida na T15 (`a5ed4a3f`). O painel tem a mesma borda cinza de "Ações da viagem" nos dois temas                                                                                                                                                                                                                                                                                   | `t16-acoes-de-campo-*`    |
| Textarea "Observação" com fundo diferente (T9)     | Corrigido na T15 (`a5ed4a3f`). Tem o mesmo fundo e a mesma borda dos `Select`                                                                                                                                                                                                                                                                                                         | `t16-ocorrencia-lote-*`   |
| "nota(s)" (T9)                                     | Corrigido na T15 (`0eb8eb6d`): "Ocorrência em 10 notas", "Registrar em 10 notas", "Dar baixa em 10 notas". Continua pendente o `batchReturnPartialFailure` já registrado pela T15                                                                                                                                                                                                     | `t16-ocorrencia-lote-*`   |
| Contraste da autoria na linha do tempo (T9)        | Corrigido na T15. A frase "por Marina Alves (escritório) pelo motorista João Pereira" fica legível nos 4 prints (slate sobre grafite no escuro, slate sobre papel no claro)                                                                                                                                                                                                           | `t16-linha-do-tempo-*`    |
| Ocorrência de parada pelo escritório sem foto (T8) | **Decisão:** a foto **não** entra por esta task. `parseOfficeStopOccurrenceRequest` (`trip-field-office.schema.ts`) só lê JSON com `parseBody`, e mudar a rota é API. No frontend, o diálogo ganhou a dica "Precisa anexar foto? Registre a ocorrência na nota…", porque a ocorrência de nota (T9) aceita foto. Se a parada precisar da própria foto, isso fica como pendência de API | `t16-ocorrencia-parada-*` |

## Achados novos: corrigidos

| #   | Superfície                       | Achado (medido)                                                                                                                                                                                                                                                                              | Correção                                                                                                                                                                                                                                                                      | Commit                 |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | Assistente, conferência          | "Entregue em", "Nome de quem recebeu" e "Documento" crus: **21 px**, fundo branco do navegador, rótulo na mesma linha do campo (`t16-antes-conferencia-confirmada-*`)                                                                                                                        | `.dialog label` em bloco e `.dialog input` com os tokens `--field-*`; dois campos por linha a partir de 40rem                                                                                                                                                                 | `92efab85`             |
| 2   | Assistente, conferência          | A foto em largura total empurrava **Confirmar para fora da tela**, a 1280×800 e a 375×812: uma rolagem por nota                                                                                                                                                                              | Foto limitada a 34vh (`object-fit: contain`) e barra de ações fixa ao pé do diálogo (`.stepActions`, sticky)                                                                                                                                                                  | `92efab85`             |
| 3   | Assistente, teclado              | **O Enter não capturava** ao abrir: o foco ficava no contêiner, e o atalho mora no `div` do passo. Depois do primeiro clique o botão desmontava, o foco caía no `<body>`, e **o Enter e o Esc paravam**. "Fechar com fotos" não pedia confirmação (teste falhou no antes)                    | `fieldDeliveryWizardFocus.service.ts`: a cada troca de passo, o foco vai ao controle marcado com `data-field-delivery-focus` (Capturar, Confirmar, Enviar, Tirar outra foto, Tentar de novo, seletor da nota). Sem alvo, vai ao diálogo, nunca ao body                        | `92efab85`             |
| 4   | Assistente, conferência          | O Enter confirmava qualquer identificação                                                                                                                                                                                                                                                    | O foco só cai em Confirmar quando o **código de barras bateu com a nota esperada**. Outra nota, sugestão do OCR e leitura falha levam o foco ao seletor, e um Enter distraído não grava nada (ADR-0067 §4). Conferência em `<form>`: Enter num campo de texto confirma        | `92efab85`             |
| 5   | Assistente, Capturar             | O botão ficava `disabled` durante a leitura: o foco se perdia e, com erro de captura, não voltava                                                                                                                                                                                            | `aria-busy` e a guarda que já existia em `runCapture`. O rótulo vira "Lendo o canhoto…"                                                                                                                                                                                       | `92efab85`             |
| 6   | "Esta foto é da nota"            | Só o destinatário: duas notas do "Mercado Bom Preço" viravam **duas linhas iguais**, e sem destinatário aparecia o **UUID**                                                                                                                                                                  | `toFieldDeliveryTargetOption`: rótulo "9000/1" e o destinatário como `description` do `Select`                                                                                                                                                                                | `92efab85`             |
| 7   | Sugestão do OCR                  | Dizia **"Canhoto conferido: é a nota esperada."** sobre uma sugestão do OCR, o que contradiz a ADR-0067 §4. O número aparecia como "000009000/1", o destino podia cair no UUID, e "— Experimental" era texto solto                                                                           | Frase própria ("O código de barras não foi lido. A nota abaixo foi sugerida pelo número impresso, confira antes de confirmar"), número "9000/1", destino "9000/1 · Mercado Bom Preço", selo com o `Badge` (secondary) do design system                                        | `92efab85`             |
| 8   | Moldura do assistente            | Destoava dos vizinhos (`TripConfirmDialog`, `FieldOccurrenceDialog`): fundo asfalto em vez de grafite, borda cinza em vez de cobre, título a 1rem em vez de 1.35rem. O contraste aparecia **empilhado** ao abrir o "Sair do assistente?"                                                     | Mesma moldura da família `mdfeGateDialog`                                                                                                                                                                                                                                     | `92efab85`             |
| 9   | Toque no celular                 | Botões dos diálogos com **38 px** a 375 px: o diálogo abre em portal, fora de `.tripShell`, que é quem sobe o compacto para 44 px                                                                                                                                                            | `--control-height-compact: var(--touch-target)` no overlay do assistente e no `.mdfeGateOverlay`, e volta ao compacto a partir de 40rem. Medido depois: **nenhum** controle abaixo de 44 px nos 32 prints de celular (tirando o `input[type=file]` escondido de 1×1)          | `92efab85`, `b89237f6` |
| 10  | Faixa da nota sobre a câmera     | Fundo asfalto a 65% sobre o papel branco do canhoto: cinza médio com texto claro, e "Nota 1 de 10" a 0.75rem com opacidade 0.85                                                                                                                                                              | Fundo a 92%, filete, fontes 0.8/1.1/0.9rem, sem opacidade no texto                                                                                                                                                                                                            | `92efab85`             |
| 11  | "Pular nota"                     | Ícone "X", o mesmo de fechar o diálogo                                                                                                                                                                                                                                                       | `chevron-right`                                                                                                                                                                                                                                                               | `92efab85`             |
| 12  | Bloqueio (canhoto fora do lote)  | Não dizia qual era a nota esperada e só oferecia "Tirar outra foto"                                                                                                                                                                                                                          | Faixa da nota no fluxo e "Pular nota" (`FieldDeliveryBlockedStep`, extraído do assistente)                                                                                                                                                                                    | `92efab85`             |
| 13  | Câmera negada / indisponível     | A faixa da nota sumia junto com o vídeo, e o texto era seco ("Câmera negada — envie o arquivo")                                                                                                                                                                                              | Faixa estática, e o texto diz o que fazer: "Escolha o arquivo do canhoto abaixo — ou libere a câmera nas permissões do site e abra a baixa de novo." O foco vai ao "Escolher arquivo"                                                                                         | `92efab85`             |
| 14  | Resumo antes de enviar           | "Enviar" esticado a 100% (o mesmo defeito que a T11 corrigiu no "Voltar"), só o número da nota, "Pulada" e "Fotografada" iguais, **sem como desfazer um Pular**, seletor de motorista ainda trocável sem efeito (o motorista já foi em cada rascunho no Confirmar), e "Enviar 0 notas" ativo | Botão na barra, destinatário na linha, estado com ícone e cor, "Voltar" até o envio, seletor oculto no resumo. Com 0 fotografadas: Enviar desabilitado e aviso de como retomar                                                                                                | `92efab85`             |
| 15  | Resultado do envio               | "Não foi possível falar com a API.", jargão para o escritório. "1 nota falhou" com a mesma cor do resto, e sem destinatário                                                                                                                                                                  | "Sem conexão com o servidor. Confira a internet e tente de novo." (`feedback.requestFailed` da viagem), resumo da falha em `--color-alert`, destinatário na linha, foco em "Tentar de novo". A lista de resumo continua com `aria-live="polite"` e a falha com `role="alert"` | `92efab85`             |
| 16  | Ocorrência de parada             | Abria com **"Cobrança inesperada" já marcada** (o primeiro item do vocabulário): um Registrar distraído gravava o tipo errado                                                                                                                                                                | Tipo vazio com "Selecione o tipo", e Registrar desabilitado até escolher, igual à ocorrência de nota                                                                                                                                                                          | `b89237f6`             |
| 17  | "Chegou em", distância da parada | Os mesmos campos crus de 21 px. De quebra, o motivo do `TripReasonDialog` também estava cru                                                                                                                                                                                                  | `.mdfeGateDialog label` e `input` com os tokens de campo (checkbox, rádio e arquivo ficam de fora)                                                                                                                                                                            | `b89237f6`             |
| 18  | Diálogos no celular (tela cheia) | O grid com `height: 100%` esticava as linhas: vãos de ~90 px entre os campos (`t16-antes-ocorrencia-lote-celular-claro`)                                                                                                                                                                     | `align-content: start`                                                                                                                                                                                                                                                        | `b89237f6`             |
| 19  | Painel do OCR (Comprovante)      | Botão "Ligar a leitura do canhoto" com **1076 px**, esticado no grid do painel                                                                                                                                                                                                               | Faixa `.actionActions`: 202 px                                                                                                                                                                                                                                                | `b89237f6`             |
| 20  | Painel "Ações de campo"          | "Em nome do motorista" na fonte do corpo, maior que os rótulos de campo do resto da tela                                                                                                                                                                                                     | `.actionForm label` a 0.85rem, como `.fieldGrid label`                                                                                                                                                                                                                        | `b89237f6`             |
| 21  | Ocorrência em lote               | "Foto (opcional)" seguido de "Opcional — uma foto vale…"                                                                                                                                                                                                                                     | "Uma foto vale para todas as notas do lote."                                                                                                                                                                                                                                  | `92efab85`             |

## Toques para dar baixa em 10 notas

A conta vale para todas as notas com código de barras legível, que é o caminho feliz. Abrir o lote
custa dois gestos: "Selecionar todas as notas da parada" e "Dar baixa em 10 notas".

| Caminho                 | Antes                                                                                           | Depois                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Desktop 1280×800, mouse | 2 + 10 × (Capturar + **rolar** + Confirmar) + Enviar = **23 cliques + 10 rolagens**             | 2 + 10 × (Capturar + Confirmar) + Enviar = **23 cliques, 0 rolagens**                              |
| Desktop, teclado        | **Impossível.** O Enter não capturava ao abrir, e depois de um clique o foco ia para o `<body>` | 2 cliques + **21 Enter** (Enter, Enter por nota, e Enter no Enviar). Provado pelo teste `teclado:` |
| Celular 375×812         | 2 + 10 × (Capturar + **rolar** + Confirmar) + Enviar = **23 toques + 10 rolagens**              | **23 toques, 0 rolagens**. Capturar e Confirmar ficam na barra ao pé, sempre à mão                 |

A redução que ficou **de fora de propósito** é auto-confirmar quando o código de barras bate. Isso
cortaria 10 toques, mas a ADR-0067 §4 proíbe o assistente de decidir sozinho. **Proposta
registrada, sem implementação:** o escritório que digitaliza o maço inteiro escolheria vários
arquivos de uma vez (um toque para 10 canhotos, e cada um cairia no seu passo pela identificação).
Isso é funcionalidade nova, não ajuste de design.

## Testes

A lógica nova tem contrato próprio. Honestidade sobre a ordem: os contratos foram escritos logo
depois dos serviços, na mesma sessão, e não antes deles.

- `test/trip/field-delivery-review.contract.ts` (importado por `test/trip.contract.test.ts`) testa o
  rótulo e a descrição do seletor, o nome corrido, o número do OCR sem zeros, a frase da conferência
  (a sugestão do OCR nunca é "conferida"), o alvo do foco, "Pular" a partir do bloqueio e "Voltar" a
  partir do resumo.
- `test/trip-hooks/field-delivery-focus.contract.ts` (importado por `test/trip-hooks.contract.test.ts`,
  com DOM) testa o alvo marcado, o invólucro (`Select`/`FileField`), o `input[type=file]` escondido
  que nunca é alvo, o alvo desabilitado que cai no diálogo, e que o foco já dentro do diálogo não é
  roubado.
- O teste `teclado:` do spec de prints testa, no navegador, o Enter que captura, o Enter que
  confirma, a nota 2 com o foco em "Capturar", o foco no seletor quando é outra nota, e o Esc que
  pede confirmação.

## Gates (2026-09-18, fim da T16)

| Gate            | Comando                                                                 | Resultado                                                                                          |
| --------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| typecheck       | `bun run typecheck` (raiz)                                              | exit 0                                                                                             |
| lint            | `bun run lint` (raiz)                                                   | exit 0                                                                                             |
| testes frontend | `bun run --cwd apps/frontend-transportada test`                         | `4661 pass, 0 fail` + `30 pass, 0 fail` (`test:hooks`)                                             |
| build           | `bun run --cwd apps/frontend-transportada build`                        | exit 0                                                                                             |
| prints          | spec de prints (acima)                                                  | `61 passed`                                                                                        |
| smoke           | `playwright test field-delivery.smoke.spec.ts responsive.smoke.spec.ts` | `field-delivery` passou. `responsive`: **6 falhas, que já existiam antes desta task** (ver abaixo) |

As 6 falhas do `responsive` são dos testes de MDF-e da viagem (852, 884, 1337) e do desenho da
carga (1673 ×3). Todas falham no `expect(api.failures()).toEqual([])` com `net::ERR_FAILED` em
rotas que esses smokes não mocam (`/trips/:id/timeline`, `/trips/occurrence-types/field`,
`/view-preferences`). Elas batem numa API sem banco. Para provar que não vêm desta task, o mesmo
comando rodou numa árvore temporária no `HEAD` anterior (`397e66d7`, sem a T16), com o mesmo
build e preview. Deu **as mesmas 11 falhas** quando o `trip-timeline.smoke` entrou junto, e as
mesmas 6 do `responsive`. A árvore temporária foi removida (`git worktree remove` e `prune`).

⚠️ `trip-timeline.smoke.spec.ts` grava os prints da spec 158 **antes** do `expect` que falha. Ao
rodá-lo localmente, os PNGs de `specs/158-…/prints/` foram sobrescritos e depois restaurados com
`git checkout`. Nada da 158 entrou nos commits.

## Commits

1. `92efab85`: fix(trip): assistente de baixa — teclado, campos, conferência e resumo (T16)
2. `b89237f6`: fix(trip): campos e toque dos diálogos da viagem, ocorrência de parada e painel do OCR (T16)
3. `96178e56`: test(trip): prints da revisão de design da spec 156 (T16)
4. este arquivo e o `[x]` da T16 no `tasks.md`

## Prints (`specs/156-o-escritorio-da-baixa-pelo-motorista/prints/`)

Depois: `t16-<estado>-<desktop|celular>-<claro|escuro>.png`, com 17 estados × 4, ou seja 68 arquivos:
`acoes-de-campo`, `chegada`, `ocorrencia-parada`, `ocorrencia-lote`, `captura`,
`conferencia-confirmada`, `conferencia-outra-nota`, `conferencia-manual`, `bloqueio`, `sugestao-ocr`,
`camera-negada`, `resumo`, `envio-falha-parcial`, `envio-sucesso`, `fechar-com-fotos`,
`linha-do-tempo`, `painel-ocr`.

Antes: `t16-antes-<estado>-desktop-escuro.png` e `t16-antes-<estado>-celular-claro.png`, com os
mesmos estados. `fechar-com-fotos` e `painel-ocr` não têm "antes": o primeiro falhava justamente
pelo defeito 3 (o Esc não chegava ao diálogo), e o segundo por falta de permissão no mock, corrigida
depois.

## Registrado, não corrigido

- **Checkbox de seleção da nota com 20×24 px no celular.** É o primitivo `Checkbox` do design
  system, usado em toda tabela. Mudar o alvo dele é decisão do design system e não cabe numa tela.
  O caminho do lote começa por "Selecionar todas as notas da parada", que tem o mesmo tamanho.
- **Não há primitivo de data e hora no design system.** "Entregue em" e "Chegou em" continuam
  `datetime-local` nativo, agora com os tokens de campo, o mesmo precedente do
  `MdfeManifestCreationPanel`. O `DatePicker` só cobre data.
- **Foto na ocorrência de parada:** precisa de rota multipart na API (T5). Fora do escopo desta
  task, que não mexe na API.
- **Troca de motorista no meio do lote:** cada rascunho leva o motorista escolhido no momento do
  Confirmar. O JSDoc de `FieldDeliveryWizardHeader` diz "o mesmo motorista vale para todos os
  rascunhos desta sessão", o que só é verdade se ninguém trocar no meio. Não há perda de dado, mas
  fica o registro para decidir se o seletor deve travar depois do primeiro Confirmar.
- **Tamanho dos arquivos:** `FieldDeliveryWizard` tem 236 linhas (eram 232), `FieldDeliveryReviewStep`
  213 e `FieldDeliveryCaptureStep` 216. Passaram de 200 pelos comentários de decisão. O bloqueio já
  foi extraído. A extração maior, M12 do `TripDetail`, continua pendente desde a T15.
- `batchReturnPartialFailure` (plural com dois números) e M12, já registrados pela T15.
