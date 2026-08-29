# 066 — o MEI chega com anexo · evidência

> **Só o smoke da fase 1 (T007) ficou de fora.** Tudo o mais entrou: o caminho do **candidato** —
> anexar no cadastro público, ler o CCMEI no navegador, guardar o rascunho, vincular à candidatura e
> pôr a decisão na mão do operador — e a fila de revisão do agregado **já cadastrado**, que a fase 1
> pedia.

## O que ficou de pé

| Task      | O que entrou                                                                         |
| --------- | ------------------------------------------------------------------------------------ |
| T003–T006 | a aba de documentos do agregado: fila, divergência, decisão por linha, URL assinada  |
| T008–T010 | `GET /public/cnpj-info` e o bloco Empresa do `/cadastro`, preenchido no blur do CNPJ |
| T017–T019 | `@adatechnology/document-intake` publicado, e a landing lendo PDF sem afrouxar a CSP |
| T020–T021 | divergência CNPJ digitado × CNPJ impresso, e o smoke com CCMEI sintético             |
| T022–T024 | `aggregate_application_attachments`, a rota pública de anexo e o vínculo no submit   |
| T025      | o painel do operador: ler, abrir, aprovar e recusar anexo por anexo                  |

## Como foi verificado

`make check` completo na árvore da spec: **exit 0, 6652 testes, zero falhas** — `format:check`, lint,
typecheck, teste e build das seis apps.

Recortes que provam esta spec em particular:

| Suíte                                                     | Resultado          |
| --------------------------------------------------------- | ------------------ |
| `fleet-application` + `fleet-http` + `fleet-schema` (API) | 239 passes         |
| `fleet.contract.test.ts` (painel)                         | 444 passes         |
| `aggregate-application-attachment-link.integration.ts`    | 4 passes, Postgres |

O teste de integração é o que mede o que teste com repositório falso não mede: as três guardas do
vínculo são cláusulas de um `UPDATE`, e num duplo elas são string que ninguém executa.

## Três correções ao plano, e por que elas existem

**Sem `expires_at`, e sem job de expurgo.** O plano previa rascunho com validade e um expurgo no
cron. A decisão de 2026-08-27 inverteu isso: o rascunho é o **comprovante do que o candidato
enviou**, e comprovante que se apaga sozinho não é comprovante. T015 foi cancelada — sem prazo não há
o que expurgar. ⚠️ A consequência é que o anexo fica guardado por tempo indeterminado, e isso **puxa
a ADR-0039** (criptografia em repouso) para mais perto: o CCMEI imprime CPF, RG e endereço.

**O `document-intake` não virou `packages/` local.** A T017 dizia `packages/document-intake/`, e este
repositório não tem `packages/` — biblioteca compartilhada mora no repo externo. Ele foi publicado de
lá, e as apps o consomem por versão.

⚠️ **As versões estão desalinhadas**: landing e API em `0.1.0-rc.3`, painel em `0.1.0-rc.2`. Não é
defeito — o painel só usa o mapa do CRLV, que a rc.2 já tinha, e a rc.3 acrescentou `readCcmei`. Fica
escrito porque a próxima pessoa a mexer numa das três vai encontrar isso e precisar decidir se
alinha.

**O CCMEI aprovado não copia para `aggregate_documents`.** `PROMOTABLE_TYPES` tem `cnh` e `crlv`, e
deixa o CCMEI de fora de propósito: aquela tabela modela **documento exigido do agregado**, com um
tipo por linha, e o CCMEI não é um deles. Encaixá-lo exigiria separar "documento exigido" de
"documento guardado" — mudança de modelo, não de lista. Ele continua vivendo como anexo da
candidatura, que é onde o operador o lê.

## O que não entrou

**O smoke da fase 1 (T007).** A aba de documentos do agregado está de pé e coberta por sete
contratos em `test/fleet/aggregate-documents-tab.contract.ts` — inclusive o que exige URL assinada em
vez de link para o objeto, e o que impede a recusa sem motivo. O que falta é o passo em navegador
real: aprovar e ver o estado mudar na tela servida. **Contrato não substitui isso** — ele prova o
componente, não a página montada com a API do outro lado.

⚠️ A tela nasceu como `AggregateDocumentsTab.component.tsx`, e não `AggregateDocumentsCard` como a
T004 escreveu. É aba dentro da área de frota, não card solto; o nome do arquivo na task envelheceu, o
comportamento pedido não.

**A fase 0 (T001–T002).** O mapa de rótulos do CCMEI foi fechado contra amostra real conferida à mão,
**fora do repositório** — a § Privacidade da 048 recusa PII versionada, e o teste usa PDF sintético
com camada de texto de verdade. Isso prova bytes → fragmento → geometria → campo; **não** prova que o
layout do gov.br é este. As outras três dúvidas da `spec.md` seguem abertas.

**CNH-e e CDT não se leem por camada de texto.** O PDF deles é invólucro do Serpro com o documento
como imagem: a extração devolve ~400 caracteres de texto legal e nenhum campo. Esse é o resultado
**correto** — os parsers ancoram em rótulo, ausência vira campo vazio, e campo vazio nunca vira
divergência.

## Uma fragilidade consertada no caminho

O teste de integração do vínculo é **quatro bancos descartáveis, quatro rodadas de migration** — ~2s
por caso em máquina ociosa, contra o teto padrão de 5s do Bun. Ele passou três vezes e falhou duas,
e as duas falhas foram enquanto outra suíte de banco corria junto. Num runner de CI, que é mais
concorrido que este laptop, isso é cara ou coroa. Os quatro casos passaram a declarar timeout
explícito.

⚠️ **A família toda tem a mesma fragilidade** — `fuel-price-repository`, `trip-repository`,
`freight-region-repository` e as demais usam o mesmo desenho sem timeout declarado. Medido agora:
`fuel-price-repository` roda 6 casos em 12s e passa. Não foram tocadas — seriam sete arquivos por um
defeito que ainda não se manifestou.
