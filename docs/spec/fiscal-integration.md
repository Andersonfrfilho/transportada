# Integração fiscal Ada

## Evidência do inventário inicial

Checkout analisado: `../adatechnology-packages`, pacote
`@adatechnology/fiscal-provider` versão `0.1.0`.

Exports públicos encontrados:

- `FiscalProvider`: `emit`, `cancel`, `testConnection`;
- `createFiscalProvider`;
- `SefazCteProvider` e tipos CT-e;
- `NfeDistribuicaoProvider`, `consultarCnpj`, `importarNfeXml`;
- `validateCertificate`;
- `FiscalError`, `FiscalConnectionError`, `FiscalRejectionError`,
  `FiscalTimeoutError`.

O provider CT-e exige `CteConfig` + `CteData`; a emissão externa é síncrona no
CT-e 4.00, mas será executada pelo worker. A distribuição de NF-e não implementa
`FiscalProvider` e precisa de adapter próprio.

## Portas da aplicação

```ts
interface CteFiscalGateway {
  issue(input: IssueCteCommand): Promise<CteIssueOutcome>
  cancel(input: CancelCteCommand): Promise<CteCancelOutcome>
  testConnection(input: FiscalConnectionCommand): Promise<FiscalConnectionOutcome>
}

interface NfeDistributionGateway {
  fetch(input: FetchNfeDocumentsCommand): Promise<FetchNfeDocumentsOutcome>
  importXml(input: ImportNfeXmlCommand): Promise<ImportedNfe>
}

interface NfseFiscalGateway {
  issue(input: IssueNfseCommand): Promise<NfseIssueOutcome>
  cancel(input: CancelNfseCommand): Promise<NfseCancelOutcome>
  fetchStatus(input: FetchNfseStatusCommand): Promise<NfseStatusOutcome>
  fetchDocuments(input: FetchNfseDocumentsCommand): Promise<NfseDocumentsOutcome>
}
```

Esses são contratos internos propostos, não métodos atribuídos ao pacote.

## Trilho NFS-e municipal

A NFS-e é o terceiro documento fiscal do produto, ao lado de CT-e e MDF-e, e não vem do
`@adatechnology/fiscal-provider`: o `NotaRpNfseProvider` do pacote fala só a API v3 da Nota RP, e a v3
não atende Ribeirão Preto. O adaptador da **v2** vive dentro do worker, atrás de `NfseFiscalGateway`
([ADR 0029](../adr/0029-nfse-municipal-via-nota-rp-v2.md)).

Diferenças em relação aos outros dois trilhos:

- **Autorização assíncrona.** `POST /emitir` devolve `id_nota` na hora; a nota fica em
  `pending_authorization` até o job `nfse.status.pull` confirmar por `GET /notas/?id_nota=`. A
  consulta autenticada é a única fonte de verdade — o `CallbackUrl` exigido pelo payload v2 aponta
  para uma rota anônima que só antecipa a consulta.
- **Erro chega como HTTP 200.** A v2 sinaliza falha no corpo (`success:false`), não no status. O
  adaptador classifica pelo corpo; tratar só o status gravaria falha como sucesso.
- **Chega PDF.** Além do XML autorizado, a prefeitura devolve o PDF da nota; ambos vão para o bucket
  privado com purpose `nfse_document`.
- **Valor e agrupamento.** O valor do serviço vem do mesmo `composeCharge` do CT-e, e a seleção é
  agrupada por tomador — uma NFS-e por tomador, nunca uma com dois.

## Regras de implementação

- depender apenas de exports públicos;
- fixar versão e registrar upgrade em ADR;
- mapear erros do pacote para taxonomia interna sem perder `cause`;
- persistir request sanitizado, response, código, tentativa e correlation ID;
- usar fake gateway em unidade, mock SEFAZ em integração e homologação em smoke
  test manual;
- DACTE não foi confirmado no inventário como export público: manter requisito
  bloqueado até validar suporte ou escolher gerador separado.

## Quando o MDF-e de uma viagem pode nascer (spec 059, ADR-0046)

A viagem **não fala com a SEFAZ** — quem fala é a trilha de emissão. O que ela passa a saber é
_quando pedir_, e a regra é uma só, em `checkTripAcceptsManifest`:

- a viagem está em `dispatched` — vale para o botão manual também, porque é depois do despacho que o
  conjunto de notas para de mudar (ADR-0043 §2). Antes disso o manifesto declararia um conjunto que
  alguém ainda pode alterar;
- **toda** nota vinculada tem CT-e autorizado. A prontidão é lida do estado real de
  `cte_fiscal_documents` a cada consulta, nunca de uma flag — flag dessincroniza no cancelamento de um
  CT-e, e manifesto sobre flag velha é declaração falsa;
- no máximo 50 municípios de descarregamento, recusados **com a lista** antes de tocar a fila;
- a empresa tem certificado válido — conferido antes de enfileirar, não depois de a SEFAZ recusar.

Emissão automática ao ficar pronta é opção da empresa e **nasce desligada**: é ação irreversível
contra órgão público, e ligá-la por padrão decide pelo cliente algo que custa dinheiro dele.

**Não implementado:** encerramento automático do manifesto quando a viagem vai a `completed`.
Manifesto não encerrado é pendência na SEFAZ e trava o próximo — dívida conhecida, registrada aqui e
no `evidence.md` da 059.

## Eventos que mudam a situação da NF-e (spec 149)

Uma NF-e importada nasce com status `authorized` ou `unsigned` e fica nesse estado até um evento fiscal da SEFAZ (ou o resumo da distribuição) mudar seu status. A mudança é atômica, registrada com lock por chave (`company_id, access_key`) para evitar corridas de nota e evento inseridos em paralelo.

**Eventos que mudam o status:**

- `tpEvento 110111` (cancelamento) ou `110112` (cancelamento por substituição), com `cStat 135` (registrado e vinculado) | `136` (registrado sem vínculo) | `155` (cancelamento homologado fora de prazo): mudam para `cancelled`.
- `cSitNFe 2` do resumo `resNFe` da distribuição: muda para `cancelled` (válido de `authorized` ou `unsigned`).
- `cSitNFe 3` do resumo: muda para `denied` (válido só de `unsigned`; `authorized → denied` é impossível).

**Eventos sem efeito:**

- `tpEvento 110110` (Carta de Correção): registrado mas não muda a nota.
- `tpEvento 210200`+ (Manifestação do destinatário): registrado mas não muda a nota.
- Cancelamento com `cStat` fora de `{135, 136, 155}` ou sem `cStat`: registrado, gera `warn nfe_event_status_not_applied`, não muda a nota.
- Resumo com `cSitNFe 1`: não muda a nota.
- **Evento enviado por upload** (origem `manual`), qualquer que seja o `cStat`: registrado no histórico,
  gera `warn nfe_event_status_not_applied` com motivo `unverified-upload`, não muda a nota e não faz a
  nota inserida depois nascer cancelada. **Só evento vindo da distribuição muda status** — XML subido
  pelo usuário não prova registro na SEFAZ. O mesmo evento chegando depois pela distribuição cancela
  normalmente (spec 149 D21).

**Worker — o que ele grava e confere:**

- `nfe_events.protocol` só é gravado com 15 dígitos (`nProt`) e `statusCode` presente; senão `null`.
- Antes da **primeira transmissão** de um CT-e, o worker relê o status de **todas** as notas do item
  em `cte_batch_item_documents` (item agrupado por remetente/destinatário tem N notas), por
  `company_id` (item de lote anterior à composição, sem linhas ali, confere a nota da ponte
  `cte_batch_items.nfe_document_id`): alguma não `authorized`, ou nem composição nem ponte, falha o item com
  `CTE_BATCH_DOCUMENT_NOT_AUTHORIZED` sem chamar a SEFAZ. A checagem é pulada quando a tentativa pode
  já ter chegado à SEFAZ (`in_flight` em redelivery, ou `retry_scheduled` por erro/timeout com o mesmo
  número): o gateway reconcilia a duplicidade, e a tela mostra "NF-e cancelada após a emissão". Retry
  depois de número queimado confere de novo — o número novo nunca foi transmitido.
- **Ambiente fiscal não é casado entre nota e evento:** `nfe_documents` não guarda `tpAmb` e
  `nfe_events.environment` só é preenchido para evento da distribuição. Casar exige gravar o ambiente
  da nota (follow-up, spec 149 D23).

**Máquina de estados:**

- `authorized` → `cancelled` | `unsigned` → `cancelled` | `unsigned` → `denied`.
- `cancelled` e `denied` são **terminais** — nenhum caminho tira uma nota desses estados.

**Histórico e rastreabilidade:**

- Cada mudança de status é gravada em `nfe_document_status_changes` com `changed_at`, origem (`manual`|`automatic`), ator (quem solicitou), snapshot (`status_before`, `status_after`), e protocolo do registro.
- Eventos que não mudam status (CC-e, manifestação) também são gravados com snapshot identidade (`status_before = status_after`).
- Evento que chega antes da nota deixa-a inserida já no status alvo (ex.: nota nasce `cancelled` se havia cancelamento pendente).
- CC-e não toca `updated_at` da nota — só eventos de cancelamento e resumo com situação 2/3 movem a nota ao topo da listagem.
- Eventos antigos (sem origem/ator/snapshot) aparecem com "origem desconhecida" e "status anterior não registrado" — snapshots não são recalculados.

**Endpoint de consulta:**

- `GET /v1/nfe-documents/:id/events` (permissão `invoices.read`): retorna histórico ordenado por `registered_at desc, id desc`, paginado por cursor `(registered_at, id)`.
- Resposta inclui tipo de evento (código), sequência, timestamps (`occurredAt`, `registeredAt`), protocolo, `cStat`, status anterior/novo, origem, ator (com nome resolvido por membership), texto de CC-e.
- Acesso entre empresas retorna 404.
- Nunca expõe XML, chave de objeto no storage, ou PII de ator removido (devolve `{ removed: true }`).

## Riscos a esclarecer

- cobertura real de UFs e contingência CT-e;
- consulta de protocolo CT-e versus apenas status de serviço;
- manifestação necessária na distribuição de NF-e;
- certificado A1, validade, cadeia e política de rotação;
- regras de tomador, CFOP, ICMS e particularidades por UF;
- geração oficial de DACTE;
- teto real de caracteres da `Discriminacao` na v2 da Nota RP, e se a numeração de RPS é do emitente
  ou do provedor — os dois só se resolvem contra a conta real (`GET /dados-cadastrais`).
