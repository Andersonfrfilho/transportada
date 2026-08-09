# Feature 013 — Frota, condutores e MDF-e

## Problema e resultado

A feature 012 levou a nota até o CT-e autorizado. Falta o documento que autoriza o caminhão a
rodar: o **MDF-e** (modelo 58). Sem ele o veículo circula em situação irregular, e a fiscalização
de estrada cobra o manifesto, não o CT-e.

`T026` da 012 ficou aberta por dois motivos. O primeiro caiu: o `@adatechnology/fiscal-provider`
já emite MDF-e 3.00 (`SefazMdfeProvider`, `MDFeRecepcaoSinc` na SVRS). O segundo continua: o TMS
não tem **veículo, condutor nem viagem**. O `<veicTracao>` pede placa, RENAVAM, tara, capacidade,
tipo de rodado e de carroceria; o `<condutor>` pede nome e CPF. Nada disso existe no banco.

E o cadastro de condutor não é só um formulário: o motorista vai logar num app de campo para
mandar posição, evento de carga, foto e canhoto. Cadastrar sem prever isso significa refazer.

**Resultado esperado:** o operador cadastra a frota e os motoristas; seleciona CT-es autorizados,
escolhe veículo e condutor e gera um manifesto; transmite; ao fim da viagem encerra. O manifesto
carrega desde já a identidade do motorista, para o app de campo se plugar sem mexer no modelo.

Decisões de modelagem em `docs/adr/0016-fleet-drivers-and-mdfe-manifest.md`.

## Fora do escopo

- Modais que não sejam rodoviário (`modal` ≠ `1`).
- MDF-e de contingência (`tpEmis` ≠ `1`).
- DAMDFE em PDF — entregamos o XML autorizado; o PDF fica para feature própria, igual ao DACTE.
- O app de campo em si: `trip_events`, upload de foto e as rotas `trip.*` ficam para a feature do
  app. Esta feature entrega o papel `driver`, o vínculo motorista↔usuário e o manifesto como
  agregado de viagem — o desenho, não a construção.

  > **Emenda (ADR-0023, spec 027 — viagens não fiscais):** a premissa "o manifesto é a viagem"
  > acima foi revertida. `trips` passa a ser entidade própria, desacoplada de `mdfe_manifests`
  > (`mdfe_manifests.trip_id` é FK opcional, não o inverso) — existem viagens sem MDF-e e viagens
  > organizadas antes de todo CT-e da carga estar emitido. Ver `docs/adr/0023-trip-decoupled-from-mdfe-manifest.md`
  > e `specs/027-viagens-nao-fiscais/spec.md`.

- Consulta de MDF-e não encerrados (`MDFeConsNaoEnc`) e inclusão de DF-e em manifesto já
  autorizado (evento 110114).
- Reboque/carreta no XML — o cadastro suporta `role = trailer`, mas o `<veicReboque>` só entra
  quando houver caso real; o manifesto emite com veículo de tração.

## Histórias priorizadas

### P1 — Cadastrar a frota

**Given** sou operador com `fleet.manage`
**When** cadastro um veículo com placa, RENAVAM, tara, capacidade, tipo de rodado e carroceria e UF
**Then** o veículo fica disponível para manifesto, com placa única na empresa
**And** se for de terceiro, informo proprietário com CNPJ/CPF, RNTRC e `tpProp`

### P2 — Cadastrar motoristas e dar acesso ao app

**Given** sou operador com `fleet.manage`
**When** cadastro um motorista com nome, CPF e CNH
**Then** ele aparece como condutor selecionável, mesmo sem nunca ter feito login
**And** posso vincular esse motorista a um usuário da empresa com papel `driver`, que passa a ter
**apenas** `trip.read` e `trip.report` — nunca nota, CT-e ou faturamento

### P3 — Gerar um manifesto a partir de CT-es autorizados

**Given** sou operador com `mdfe.manage` e tenho CT-es autorizados
**When** seleciono os CT-es, o veículo de tração e os condutores
**Then** vejo a prévia com municípios de carregamento e descarga derivados dos próprios CT-es,
totais somados (`qCTe`, `vCarga`, `qCarga`) e UF de início e fim
**And** um CT-e já vinculado a manifesto não cancelado é bloqueado com motivo

### P4 — Transmitir o manifesto

**Given** sou fiscal com `mdfe.issue` e tenho um manifesto em `draft`
**When** transmito
**Then** o manifesto vai a `issuing`, o worker emite na SVRS e o resultado volta como `authorized`
com chave, protocolo e `mdfeProc` armazenado, ou `rejected` com o motivo da SEFAZ

### P5 — Encerrar e cancelar

**Given** sou fiscal com `mdfe.close` e a viagem terminou
**When** encerro informando município e UF de encerramento
**Then** o evento 110112 é transmitido e o manifesto vai a `closed` com o `procEventoMDFe` guardado

**Given** sou fiscal com `mdfe.cancel` e o manifesto está `authorized`
**When** cancelo com justificativa de no mínimo 15 caracteres
**Then** o evento 110111 é transmitido e o manifesto vai a `cancelled`
**And** manifesto já `closed` recusa cancelamento antes de chamar a SEFAZ

## Contratos que não se negociam

- `companyId` e `driverId` vêm do contexto autenticado, nunca do payload.
- Valores em `numeric`; `vCarga` com 2 casas e `qCarga` com 4 (`TDec_1104`) apenas na borda do XML.
- XML autorizado e XML de evento preservados em storage create-only, como no CT-e.
- Certificado, senha e XML sensível nunca aparecem em log.
- Um CT-e vive em no máximo um manifesto não cancelado.
- Manifesto encerrado não cancela.
