# Feature 298 — A nota bipada vem da SEFAZ

> Urgente (pedido de 06/11/2026). Publicação em fases: cada fase vai a produção sozinha.

## Problema e resultado

Em 06/11/2026 a operação tinha na mão cinco DANFEs (924712, 924713, 924725, 924727, 924728) que não estavam no
sistema. A importação automática (DF-e por NSU) estava saudável — cursor em dia, `ult_nsu = max_nsu` —, mas a
SEFAZ não tinha entregado essas notas ao CNPJ da transportadora. Bipar o código de barras na viagem só procura
nota **já cadastrada** (`useTripDocumentLinkForm.hook.ts:78`, `useTripQuickCreate.hook.ts:143`) e responde
"Nenhuma nota com esta chave de acesso nesta empresa." — sem saída na tela.

**Resultado:** bipar a chave de acesso com o leitor de mão traz a nota para o sistema, em dois lugares:

- **Página de NF-e — "Importar por bip":** bipar é importar. Nota já cadastrada é contada como "já estava no sistema";
  nota desconhecida é buscada na SEFAZ **por chave** (`consChNFe`) e **importada** pelo mesmo caminho das outras.
- **Criação da viagem:** além de buscar e importar, cada nota bipada aparece na **lista de notas encontradas** com a
  opção **"Acrescentar"**, igual ao resultado de "Buscar notas" hoje. A nota entra na viagem quando a operação
  acrescenta; o bip não acrescenta sozinho.
- A SEFAZ recusa → a linha diz o motivo em português e oferece o envio do XML ali mesmo, que importa a nota.

Bipar em lote funciona: cada chave é uma linha, nenhuma recusa trava as outras.

## Fatos que a spec assume (levantados em 06/11/2026)

| Fato                                                                                                                                              | Fonte                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| O pacote expõe `consultarPorChave({config, chaveNfe}) → DfeItem \| undefined`; ninguém usa                                                        | `fiscal-provider@0.4.0` `NfeDistribuicaoProvider.d.ts:55`; gateway do worker só tem `consultarDFe` |
| O retorno pode ser `procNFe` (XML completo) **ou** `resNFe` (resumo, sem XML)                                                                     | `P/index.js:6667-6686`                                                                             |
| Transportador do grupo `transporta` (X03), autXML e "Ator interessado" (evento 110150) recebem a NF-e **completa**                                | NT 2014.002 v1.40 §3, notas 2 e 3                                                                  |
| Quem não é interessado recebe **640**; chave inexistente **217**; fora de 90 dias **632**; cancelada **653**; denegada **654**                    | NT 2014.002 §3.10.2                                                                                |
| Limite: **20 consultas por chave ou NSU por hora** por CNPJ; passou → **656** e bloqueio de 1 h; consultar durante o bloqueio **reinicia** a hora | NT 2014.002 §3.11.4.2 (regra de 2022)                                                              |
| A distribuição por NSU (`distNSU`) tem regra própria (137 → esperar 1 h); a NT não diz que divide o contador de 20/h                              | idem §3.11.4.1 — não confirmado, ver Riscos                                                        |
| Toda chamada à SEFAZ roda no worker, nunca na requisição HTTP                                                                                     | specs 005 e 011                                                                                    |
| `nfe_documents.source` só aceita `upload` e `distribution`                                                                                        | `api database/nfe.schema.ts:27,356`                                                                |

## Fora do escopo

- Criar nota só a partir do código de barras: a chave não traz itens, destinatário nem valor; sem XML não há CT-e.
- Manifestação do destinatário (Ciência da Operação) para destravar `resNFe`: a transportadora não é destinatária.
- Acrescentar na viagem sem ação da operação: o bip importa e lista; quem acrescenta é a operação (D4).
- Conferência da carga (contar o que chegou contra o esperado): a página de NF-e importa, não confere.
- Leitura offline e a separação da spec 237 (`awaiting_xml` continua esperando importação; esta spec só a acelera).
- Trocar a consulta por NSU da importação automática.

## Histórias priorizadas

### P1 — Bipar na criação da viagem lista a nota para acrescentar

**Given** a operação cria uma viagem e bipa notas com o leitor de mão **When** cada leitura termina **Then** a nota
aparece na lista de notas encontradas: as cadastradas na hora, as desconhecidas com "buscando na SEFAZ…" até serem
importadas; cada uma tem "Acrescentar" (e "Acrescentar todas" para as prontas), igual ao resultado de "Buscar notas".

### P1 — A recusa diz o porquê e oferece o XML

**Given** a chave de uma nota que não cita a transportadora **When** a SEFAZ responde 640 **Then** a linha diz
"A SEFAZ não libera esta nota para a transportadora (ela não consta na nota). Envie o XML." com o botão de envio;
enviado o XML, a nota é importada e ganha "Acrescentar".

### P1 — Lote não estoura o limite da SEFAZ

**Given** um palete com 40 notas desconhecidas **When** são bipadas em sequência **Then** no máximo 15 consultas por
chave saem por hora (D3), as demais aparecem "na fila da SEFAZ — próxima janela HH:MM" e são consultadas na janela
seguinte sem nova ação; a importação automática nunca recebe 656 por causa delas.

### P1 — Importar por bip na página de NF-e

**Given** os DANFEs chegaram **When** a operação abre "Importar por bip" na página de NF-e e bipa todas em sequência
**Then** cada nota desconhecida é buscada e importada sozinha, e o resumo mostra quantas foram bipadas, quantas já
estavam no sistema, quantas foram importadas, estão buscando, estão na fila da SEFAZ ou foram recusadas; a lista
filtra as recusadas para a operação enviar o XML.

### P2 — Bipar no detalhe de uma viagem aberta

Mesma lista com "Acrescentar", usando o vínculo que o detalhe já faz.

## Requisitos funcionais

- **RF1** `POST /v1/nfe-access-key-lookups` `{ accessKey }` (permissão `invoices.import`, a mesma do envio de XML)
  valida a chave (44 dígitos, DV por `isChaveDvValid`) e responde:
  - nota já cadastrada na empresa → `200 { status: 'found', documentId }`, sem consultar a SEFAZ;
  - busca da mesma chave já em andamento na empresa → `200` com a busca existente (idempotente, nunca duplica);
  - senão cria a busca → `201 { id, status: 'queued' }` e o evento de outbox.
- **RF2** `GET /v1/nfe-access-key-lookups/:id` (`invoices.read`) devolve `status`, `documentId?`, `reason?`,
  `notBefore?`. Busca de outra empresa → 404 (nunca 403, não revela existência).
- **RF3** Estados: `queued` → `querying` → `imported` | `refused` | `failed`; `waiting` quando o orçamento da hora
  acabou ou a janela anti-656 está aberta (com `notBefore`).
- **RF4** Motivos de recusa estáveis (string constante, traduzida no painel): `not_interested` (640),
  `summary_only` (veio `resNFe`), `not_found` (217 ou retorno vazio), `expired` (632), `cancelled` (653),
  `denied` (654), `certificate_mismatch` (593), `invalid_key`.
- **RF5** `procNFe` recebido é importado pelo **mesmo** escritor das notas da distribuição (`writeDocumentChildren`,
  lock por chave, `onConflictDoNothing` em `(company_id, access_key)`), com `source = 'access_key'`, XML original
  preservado no storage e `xml_sha256`.
- **RF6** Se a importação automática trouxer a mesma nota antes da consulta sair, a busca termina `imported`
  apontando para o documento existente, sem chamar a SEFAZ.
- **RF7** Orçamento por empresa: no máximo **15** consultas por chave por hora corrida (margem sobre os 20 da NT).
  Ao receber 656: nenhuma consulta por chave por 65 min, e a busca volta a `waiting`. Nunca reconsultar durante o
  bloqueio.
- **RF8** Mesma chave recusada com motivo definitivo (`not_interested`, `not_found`, `expired`, `cancelled`,
  `denied`) não é reconsultada por 24 h: a busca nova devolve a recusa existente.
- **RF9** Painel — criação da viagem e detalhe: toda nota bipada vai para a **lista de notas encontradas**, a mesma
  onde hoje aparece o resultado de "Buscar notas", marcada "bipada". Cadastrada → linha pronta com "Acrescentar".
  Desconhecida → linha "buscando na SEFAZ…" (consulta o RF2 a cada 3 s enquanto a tela está aberta, máx. 10 min) que
  ganha "Acrescentar" ao chegar `imported`. "Acrescentar todas" acrescenta só as prontas. Nota já em outra viagem
  aberta aparece com o aviso que existe hoje (`alreadyOnTrip`) e sem "Acrescentar".
  ⚠️ Muda o comportamento atual da criação, que hoje acrescenta a nota cadastrada direto ao bipar
  (`useTripQuickCreate.hook.ts:143`, estado `staged`): passa a listar, como pedido em 06/11/2026.
- **RF10** Painel — linha recusada mostra o motivo e, para todo motivo exceto `cancelled`/`denied`, o botão "Enviar
  XML", que usa a importação por upload existente; importada, a linha ganha "Acrescentar".
- **RF11** Página de NF-e ganha **"Importar por bip"**: leitor de chave contínuo (o mesmo componente da spec 055,
  leitor de mão primeiro — RF11e), com a mesma fila de linhas e sem viagem.
- **RF11a** Resumo da importação, atualizado a cada leitura e a cada mudança de estado: **bipadas** (chaves distintas),
  **já estavam no sistema**, **importadas**, **buscando**, **na fila da SEFAZ** (com horário da próxima janela) e
  **recusadas** (por motivo). Chave repetida conta uma vez e mostra "já bipada"; leitura sem chave conta como
  **ilegível**.
- **RF11b** A lista filtra por situação (todas, importadas, já estavam, recusadas); cada linha mostra número, série,
  emitente (CNPJ da chave) e o estado; recusada tem "Enviar XML" (RF10), importada tem "Abrir".
- **RF11c** A lista é da tela: sobrevive a recarregar a página (armazenamento da sessão do navegador, só chaves e ids)
  e tem "Limpar lista". As notas importadas ficam no sistema; só a lista some.
- **RF11d** A verificação "já no sistema" é feita em lote: `POST /v1/nfe-documents/access-key-checks`
  `{ accessKeys: string[≤200] }` (`invoices.read`) devolve, por chave, `documentId` ou ausente — uma chamada por
  rajada de leituras (agrupadas a cada 500 ms), não uma por nota. As ausentes geram as buscas do RF1.
- **RF11e** **O leitor de mão é o caminho principal** (pistola USB/Bluetooth em modo teclado, lendo o Code-128 ou o
  QR do DANFE); a câmera é o caminho secundário. Para isso, nas três telas:
  - o campo de leitura abre **focado** e volta a ter foco depois de cada leitura, de "Enviar XML" e de fechar
    qualquer diálogo; um selo "Leitor pronto" / "Clique aqui para voltar a ler" mostra quando o foco saiu;
  - Enter **ou** Tab no fim da leitura fecha a chave; o campo se limpa na hora e a próxima leitura pode chegar em
    menos de 100 ms sem perder caractere (campo não controlado, sem atraso de digitação);
  - a chave é achada **dentro** do texto lido: 44 caracteres no padrão `CHAVE_PATTERN` em qualquer posição. Leitor
    configurado com teclado americano num Windows ABNT2 troca `?`, `=` e `/` da URL do QR; procurar a chave no meio
    do texto faz a leitura funcionar mesmo assim (a 055 só aceita chave crua, `p=` ou `chNFe=`);
  - leitura sem chave (código da embalagem, etiqueta de volume) é ignorada em silêncio e contada como "ilegível" só
    na página de NF-e.
- **RF12** Origem "busca por chave" aparece na página de NF-e como as outras origens.

## Requisitos não funcionais

- Chamada à SEFAZ só no worker (specs 005/011). A API só grava a busca e o outbox.
- Certificado: o mesmo da distribuição (`drizzle-nfe-distribution-profile.repository.ts:54`), decifrado só em memória.
- Log sem PII nem XML: `lookupId`, `companyId`, últimos 4 da chave, `cStat`, motivo.
- Isolamento: `companyId` do contexto autenticado; a chave de outra empresa nunca vira `found`.
- Tudo dentro de um `nfe_imports` (`source = 'access_key'`) para reaproveitar trilha e auditoria de importação.

## Casos extremos e falhas

- Leitor de mão com sufixo Tab em vez de Enter, ou com prefixo configurado: ambos fecham/descartam corretamente.
- Foco perdido no meio da pilha (alguém clicou fora): as leituras seguintes não podem cair em outro campo; o selo
  avisa e a primeira tecla de leitor fora do campo é desviada para ele.

- Mesma chave bipada duas vezes na mesma tela: uma linha só (fila já deduplica) e uma busca só (RF1).
- Duas pessoas bipam a mesma chave: idempotência do RF1.
- SEFAZ fora do ar / timeout: `failed` com `reason: 'sefaz_unavailable'`, botão "Tentar de novo" (não conta como
  recusa definitiva; conta no orçamento).
- `resNFe`: `refused/summary_only` — "A SEFAZ só liberou o resumo desta nota. Envie o XML."
- Viagem que não aceita mais nota quando a importação termina: a recusa do vínculo é a que já existe
  (`alreadyOnTrip`, estado da viagem); a nota continua importada.
- Ambiente de homologação (staging): a consulta vai à homologação; chaves reais de produção dão `not_found`.

## Critérios de aceite

1. Contrato da API cobre RF1–RF4, RF6–RF8 (inclusive 404 entre empresas e idempotência).
2. Contrato do worker cobre cada `cStat` do RF4, `procNFe` importado com `source = 'access_key'`, 656 abrindo a
   janela de 65 min e orçamento de 15/h.
3. Integração (banco): `procNFe` vira `nfe_documents` com filhos, e a mesma chave vinda depois pela distribuição
   não duplica.
4. Painel — criação da viagem: bipar cadastrada, desconhecida importada e recusada produz três linhas na lista de
   notas encontradas; nenhuma entra na viagem sem "Acrescentar"; "Acrescentar todas" leva só as prontas.
   4a. Importar por bip: com 50 leituras (30 cadastradas, 18 desconhecidas, 1 repetida, 1 ilegível) o resumo mostra
   bipadas 49, já estavam 30, ilegível 1, e importadas + buscando + na fila + recusadas = 18 a todo instante; a
   verificação faz no máximo uma chamada por rajada.
5. Produção: uma chave real que cita a transportadora é importada pelo bip e acrescentada a uma viagem; a evidência fica no `evidence.md`.

## Dúvidas

Nenhuma bloqueante. O resultado do T0.1 (consulta real com uma das chaves de 06/11) muda só a ordem de prioridade
dentro do P1 (se a SEFAZ responder 640, a recusa com XML é o caminho principal desses casos), não o desenho.
