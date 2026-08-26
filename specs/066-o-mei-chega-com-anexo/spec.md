# Feature 065 — O MEI chega com anexo

## Problema e resultado

O `/cadastro` público (053) pede que o interessado **digite** tudo: nome, documento, contato,
endereço, CNH, RNTRC, veículo. São 22 campos num formulário que a maioria preenche no celular, e o
agregado que se cadastra como **MEI** não tem onde declarar a empresa — `aggregate_applications`
guarda um `tax_id` único que aceita CPF ou CNPJ e nada mais. Razão social, data de abertura, CNAE e
situação cadastral não existem em lugar nenhum do sistema, e o operador que aprova a candidatura não
tem como saber se aquele CNPJ está ativo.

Ao mesmo tempo, **duas máquinas que resolvem isso já estão construídas e nenhuma delas alcança a
landing**:

| O que existe                                                    | Onde                                                             | Por que não serve hoje                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Consulta de CNPJ (`consultarCnpj`, `CnpjInfo` com 20 campos)     | `fiscal-company-profile-lookup.gateway.ts`, rota `settings.manage` | Só o painel alcança, e o mapeamento **descarta** `situacao`, `dataAbertura`, `cnae`, `porte` |
| Upload de documento + OCR (Tesseract) + pré-preenchimento        | `aggregate-document.use-case.ts`, rota `/aggregate-documents`      | Exige sessão; o portal só mostra o card **depois de aprovado** (`PortalDashboard:70`)     |
| Leitura de PDF pela camada de texto, no navegador (048)          | `frontend-transportada/src/modules/document-intake/`               | É local do app do painel — não é pacote, a landing não importa                            |

O resultado desta spec: no `/cadastro`, **o CNPJ digitado preenche a empresa** e **o documento
anexado preenche o resto**, com os anexos vinculados à candidatura desde antes do envio, chegando
junto com ela na fila de revisão do operador.

## As duas origens, e por que as duas

O usuário decidiu pelas duas, e elas não são redundantes:

- **A consulta por CNPJ é mais barata e mais confiável** — dado oficial, sem OCR, sem heurística.
  Preenche razão social, nome fantasia, endereço completo, situação e data de abertura a partir de
  14 dígitos digitados. É o mesmo movimento que o CEP já faz na tela (050).
- **A consulta não prova a condição de MEI.** `CnpjInfo` traz `porte`, `naturezaJuridica` e
  `optanteSimplesNacional`, mas **não traz um campo de MEI** — e "optante pelo Simples" não é a mesma
  coisa. O **CCMEI** (Certificado da Condição de Microempreendedor Individual) é o documento que
  prova, e é PDF com camada de texto emitido pelo gov.br, exatamente o formato que o leitor da 048
  já sabe ler sem servidor e sem OCR.

Uma preenche a ficha; a outra prova o que a ficha diz.

## O anexo se vincula à candidatura, não ao documento da pessoa

`aggregate_documents` é endereçada por `(company_id, tax_id, type)` com upsert — reenvio **atualiza a
mesma linha**. Isso funciona para quem já tem conta, e é uma porta aberta numa rota pública: bastaria
subir um arquivo qualquer informando o CPF de um terceiro para **sobrescrever o documento aprovado
dele**. Nenhum Turnstile impede isso, porque quem faz é humano.

Por isso o anexo público **não escreve em `aggregate_documents`**. Ele nasce numa tabela própria,
`aggregate_application_attachments`, endereçada por um **`draft_id` opaco** devolvido no upload — sem
`tax_id`, sem nada que ligue o arquivo a uma pessoa antes do envio. No `POST` da candidatura o
cliente manda os `draftIds` que recebeu, e é **o servidor** que amarra os anexos àquela candidatura.
Anexo cujo rascunho nunca virou candidatura é lixo com prazo de validade (§ Retenção).

Efeito colateral bom: some a sonda. Como o upload nunca consulta o banco por `tax_id`, não existe
resposta que revele se aquele documento já é motorista — a mesma razão do `202` invariável da 053.

## Fora do escopo

- **Substituir a revisão humana.** A aprovação automática por confiança alta do OCR
  (`scoreAggregateDocumentMatch`) **não** vale para anexo público: candidatura anônima sempre passa
  pelo operador.
- **OCR de imagem no navegador.** Foto e print continuam sendo aceitos como anexo e **não** extraem
  nada — é a P3 da 048, que segue aberta. Aqui eles só viajam junto para a revisão.
- **CNH e ANTT pela camada de texto.** Continuam `[NEEDS CLARIFICATION]` na 048; esta spec não abre
  o mapa de campos deles.
- **Criptografar o anexo em repouso.** Cai na ADR-0039, pendente, junto do CPF que
  `aggregate_applications` já guarda.
- **Migrar o anexo aprovado para `aggregate_documents`.** A candidatura aprovada vira motorista; se o
  anexo deve virar documento da conta é decisão da 064 e entra como `[NEEDS CLARIFICATION]` abaixo.

## Histórias priorizadas

### P1 — O CNPJ digitado preenche a empresa

**Given** um interessado que se cadastra como MEI
**When** ele termina de digitar os 14 dígitos do CNPJ e o campo perde o foco
**Then** razão social, nome fantasia, endereço, situação cadastral e data de abertura chegam
preenchidos, marcados como vindos da Receita, e **editáveis** — a marca some quando ele corrige

### P2 — O CCMEI anexado preenche o que a consulta não prova

**Given** um interessado com o PDF do CCMEI no celular
**When** ele anexa o arquivo
**Then** a leitura acontece **no navegador**, o CNPJ e a data de abertura conferem com o que a
consulta trouxe, a condição de MEI fica registrada como comprovada por documento, e nada é enviado ao
servidor além do próprio arquivo

### P3 — O anexo chega junto da candidatura

**Given** anexos enviados antes do envio do formulário
**When** a candidatura é submetida
**Then** os anexos ficam vinculados àquela candidatura e aparecem para o operador na fila de revisão

### P4 — O anexo de terceiro não derruba documento de ninguém

**Given** alguém que sobe um arquivo informando um documento que não é seu
**When** o upload acontece
**Then** nada em `aggregate_documents` é tocado, e a resposta não revela se aquele documento existe

### P5 — O operador vê os anexos e decide um por um

**Given** uma candidatura com anexos na fila de revisão
**When** o operador abre a candidatura
**Then** ele vê a **lista de anexos**, cada um com ícone do tipo (CCMEI, CNH, CRLV, outro) e o estado
por extenso — *pendente de revisão*, *aprovado* ou *reprovado com motivo* — pode abrir o arquivo, e
tem em cada linha **aprovar** e **reprovar**; reprovar exige motivo, e o motivo é o que o agregado lê

### P6 — O arquivo que ninguém enviou não fica para sempre

**Given** um rascunho de anexo que nunca virou candidatura
**When** o prazo de retenção vence
**Then** o objeto e a linha somem, sem intervenção humana

## Requisitos funcionais

- `GET /public/cnpj-info` — anônima, com rate limit próprio, devolvendo **apenas** o que já é público
  na Receita: razão social, nome fantasia, situação, data de abertura, CNAE, porte, natureza jurídica
  e endereço. Nunca inscrição estadual, nunca e-mail e telefone do titular (§ Segurança).
- `POST /public/aggregate-application-attachments` — anônima, Turnstile + rate limit, aceita um
  arquivo, devolve `draftId` e o tipo detectado. **Não** aceita `tax_id`.
- `POST /public/aggregate-applications` passa a aceitar `attachmentDraftIds: string[]` e vincula.
- `declaredData` ganha o bloco `company` (cnpj, razão social, nome fantasia, situação, data de
  abertura, CNAE, porte, origem do dado: `lookup` | `document` | `typed`).
- **A tela de revisão de anexo não existe e é desta spec.** A API está pronta e sem consumidor:
  `GET /aggregate-documents` (lista), `POST /aggregate-documents/{id}/review` (`approved` |
  `rejected` + motivo) e `GET /aggregate-documents/{id}/download` (URL assinada) já respondem sob
  `fleet.manage`, e **nenhum arquivo do `frontend-transportada` as chama** — a busca por
  `aggregate-document` no app do painel devolve zero. A spec entrega:
  - lista de anexos dentro da candidatura, em `AggregateApplicationsTab`, e a fila geral de anexos
    pendentes na aba de frota;
  - por linha: **ícone do tipo** (biblioteca de ícones, nunca emoji — `web.md` §9), rótulo do estado
    e badge de status reusando o padrão de `data-status` que o portal do agregado já usa;
  - **aprovar** e **reprovar** por linha, com motivo obrigatório na recusa, ação destrutiva com
    ícone (`web.md` §9) e confirmação;
  - abrir o arquivo pela URL assinada, nunca por link público;
  - estado vazio explícito ("nenhum anexo enviado"), que é o caso comum de quem só digitou.
- O leitor de PDF por camada de texto vira **pacote** (`packages/document-intake/`), consumido pelo
  painel e pela landing — hoje é local do `frontend-transportada` (regra de monorepo §2).

## Requisitos não funcionais

- **A CSP da landing não afrouxa.** O pdf.js entra como na 048: worker da nossa origem via `?url`,
  `isEvalSupported: false`, chunk carregado por `import()` só quando um arquivo é solto. Se isso não
  couber na landing, o anexo continua funcionando **sem** leitura local — o arquivo sobe e pronto.
- Tudo o que a 053 fixou continua: `202` invariável, nenhuma rota pública que confirme existência.
- Área de toque e largura de campo seguem o que foi corrigido no `/cadastro` mobile.

## Casos extremos e falhas

| Caso                                                | Comportamento                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Consulta de CNPJ fora do ar ou lenta                 | timeout curto, campo fica vazio e editável — **nunca** bloqueia o envio                |
| CNPJ existe mas está **baixado**/inapto              | preenche mesmo assim e mostra a situação; recusar é decisão do operador, não da tela   |
| CCMEI escaneado (sem camada de texto)                | reconhecido como `scanned`, anexado, nada extraído — igual à 048                       |
| PDF que não é CCMEI                                  | `unknown`; anexa como "outro documento", não preenche campo nenhum                     |
| Divergência entre CNPJ digitado e CNPJ do CCMEI      | não sobrescreve o digitado: sinaliza a divergência para o operador                     |
| Arquivo acima de 10 MiB, ou assinatura desconhecida  | `AggregateDocumentInvalidUploadError`, reusando `assertAggregateDocumentBytes`         |
| `draftId` inexistente, já usado ou expirado no envio | a candidatura é aceita **sem** aquele anexo — não se rejeita a candidatura por anexo    |

## Critérios de aceite

- [ ] Contrato: consulta de CNPJ devolve os campos públicos e **omite** inscrição estadual, e-mail e telefone
- [ ] Contrato: upload público não escreve em `aggregate_documents` (P4), verificado por asserção no banco
- [ ] Contrato: `draftId` inválido no envio não derruba a candidatura
- [ ] Contrato: CCMEI sintético com camada de texto → CNPJ e data de abertura extraídos
- [ ] Contrato: divergência CNPJ digitado × CNPJ do documento é sinalizada, não sobrescreve
- [ ] Smoke no navegador: arquivo entregue ao `input[type=file]` da tela real, campos chegam preenchidos
- [ ] Smoke no painel: anexo aparece na candidatura com status, o botão aprovar muda o estado na tela,
      e reprovar sem motivo é recusado
- [ ] Contrato: reprovar sem motivo devolve erro; aprovar duas vezes é idempotente
- [ ] Rastro de retenção: rascunho expirado some (job do `cron-transportada`)
- [ ] `docs/SECURITY.md` registra as duas rotas públicas novas e seus limites

## Dúvidas

- `[NEEDS CLARIFICATION: mapa de campos do CCMEI]` — não há amostra no repositório, e a § Privacidade
  da 048 recusa PII versionada. Sem um CCMEI real conferido à mão, o mapa de rótulos é palpite; o
  teste gera PDF sintético e prova o encanamento, não os rótulos do gov.br. **Preciso de um CCMEI
  (pode ser o seu, fora do repo) para fechar o mapa.**
- `[NEEDS CLARIFICATION: prazo de retenção do rascunho]` — 24h, 7 dias? Curto demais perde quem
  preenche em duas sentadas; longo demais é PII parada sem dono.
- `[NEEDS CLARIFICATION: o anexo aprovado vira documento da conta?]` — se sim, a aprovação copia para
  `aggregate_documents` e a 064 herda; se não, o anexo morre com a revisão.
- `[NEEDS CLARIFICATION: MEI é um caminho declarado ou inferido?]` — a tela pergunta "você é MEI?" ou
  deduz do documento digitado ter 14 dígitos?
