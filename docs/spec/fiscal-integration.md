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
```

Esses são contratos internos propostos, não métodos atribuídos ao pacote.

## Regras de implementação

- depender apenas de exports públicos;
- fixar versão e registrar upgrade em ADR;
- mapear erros do pacote para taxonomia interna sem perder `cause`;
- persistir request sanitizado, response, código, tentativa e correlation ID;
- usar fake gateway em unidade, mock SEFAZ em integração e homologação em smoke
  test manual;
- DACTE não foi confirmado no inventário como export público: manter requisito
  bloqueado até validar suporte ou escolher gerador separado.

## Riscos a esclarecer

- cobertura real de UFs e contingência CT-e;
- consulta de protocolo CT-e versus apenas status de serviço;
- manifestação necessária na distribuição de NF-e;
- certificado A1, validade, cadeia e política de rotação;
- regras de tomador, CFOP, ICMS e particularidades por UF;
- geração oficial de DACTE;
- NFS-e permanece fora do MVP fiscal.
