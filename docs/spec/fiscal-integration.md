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

## Riscos a esclarecer

- cobertura real de UFs e contingência CT-e;
- consulta de protocolo CT-e versus apenas status de serviço;
- manifestação necessária na distribuição de NF-e;
- certificado A1, validade, cadeia e política de rotação;
- regras de tomador, CFOP, ICMS e particularidades por UF;
- geração oficial de DACTE;
- teto real de caracteres da `Discriminacao` na v2 da Nota RP, e se a numeração de RPS é do emitente
  ou do provedor — os dois só se resolvem contra a conta real (`GET /dados-cadastrais`).
