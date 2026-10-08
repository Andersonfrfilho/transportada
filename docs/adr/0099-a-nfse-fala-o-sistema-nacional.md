# ADR 0099 — A NFS-e fala o Sistema Nacional (Sefin Nacional / ADN), sem provedor no meio

- Status: proposto (aguarda revisão do `architect` e do usuário; nada da Fase 1 em diante começa antes)
- Data: 2026-10-08
- Decisores: mantenedor do projeto (Anderson); revisão Opus pendente
- Emenda: ADR-0029 (provedor: sai a Nota RP, entra o Sistema Nacional), ADR-0035 (passa a haver dois
  ambientes) e ADR-0098 (ganha o valor `national` e, depois da primeira nota real, perde `v2`/`v3`)

## Contexto

A ADR-0029 deixou a troca de provedor como troca de adaptador atrás de `NfseFiscalGateway`, e a
ADR-0098 provou o caminho com a v3 da Nota RP. A spec 251 troca de novo: o worker monta a DPS 1.01,
assina com o A1 da própria transportadora e a envia por mTLS à Sefin Nacional, que é gratuita para o
contribuinte e tem ambiente de homologação (produção restrita). Fatos que delimitam a decisão
(`specs/251-emissor-nacional-gratuito/plan.md` § "Contrato do Sistema Nacional", lido no Swagger
oficial com o A1 em 08/10/2026):

1. **A emissão é síncrona.** `POST /SefinNacional/nfse` com `{"dpsXmlGZipB64"}` responde `201` com
   `chaveAcesso` e `nfseXmlGZipB64` na própria chamada; não há protocolo nem fila. `400`/`403`/`500`
   trazem `erros[]`. O trilho atual é assíncrono: o consumidor grava `accepted`, o write-back leva a
   nota a `pending_authorization`
   (`apps/worker-transportada/src/nfse-issuance/domain/nfse-write-back.policy.ts:30`) e só o
   `nfse.status.pull` autoriza (ADR-0029 §2).
2. **Idempotência é do emitente.** O `Id` da `infDPS` é `DPS` + município(7) + tipo de inscrição(1) +
   CNPJ(14) + série(5) + nDPS(15). `HEAD /dps/{id}` diz se aquela DPS já gerou NFS-e e `GET /dps/{id}`
   devolve a `chaveAcesso`. Série e `nDPS` são numeração nossa.
3. **A identidade da conexão é o certificado.** mTLS com e-CNPJ ICP-Brasil do próprio prestador; a
   assinatura da DPS e o TLS usam o mesmo A1; não existe procuração nem integrador (FAQ § 17.7). O
   cofre por empresa da ADR-0004 é obrigatório, não opcional.
4. **O pacote fiscal não expõe assinador público.** `@adatechnology/fiscal-provider` exporta do
   assinador só `evictCertificate`
   (`apps/worker-transportada/node_modules/@adatechnology/fiscal-provider/dist/index.d.ts:19`); o
   resto é `src/sefaz/*`, que o `CLAUDE.md` proíbe importar.
5. **Sem fonte oficial:** algoritmos XMLDSig (a nota 74, real e aceita, traz c14n 1.0 + RSA-SHA1 +
   SHA1), limites de taxa e o DANFSe (API de PDF sobrestada em 03/08/2026, Swagger em 404).
6. **Risco de cadastro:** o convênio oficial de Ribeirão Preto (3543402) diz
   `aderenteEmissorNacional = 0` em restrita **e** produção; o usuário informa que o cadastro está
   desatualizado e que a prefeitura já aceita. Declaração do usuário, não fonte oficial.
7. **Decisão do usuário (08/10/2026):** a Nota RP sai do app e fica só na lib
   `@adatechnology/fiscal-provider`; sem contingência no app; a reversibilidade é o git.

## Decisão

1. **O síncrono cabe no desenho assíncrono sem estado novo: o adaptador devolve `accepted` com a
   chave, e o status pull autoriza.**
   - `issue` do adaptador nacional, nesta ordem: monta a DPS do payload congelado, assina, e
     **sempre** faz `HEAD /dps/{id}` antes do `POST`. `200` → `GET /dps/{id}` e devolve
     `accepted` com `providerDocumentId = chaveAcesso`, sem `POST`. `404` → `POST /nfse`.
     Invariante: **nunca há `POST` sem um `HEAD` que respondeu 404 para aquele `Id`** — cobre
     reentrega do RabbitMQ, retry do consumidor e reemissão ambígua com um só mecanismo.
   - `201` → `accepted` com `providerDocumentId = chaveAcesso` (50 dígitos; a coluna é `text`,
     `apps/api-transportada/src/database/nfse.schema.ts:349`). O `nfseXmlGZipB64` da resposta **não**
     é gravado pelo consumidor: o status pull lê o mesmo documento por `GET /nfse/{chaveAcesso}` e
     autoriza pelo caminho de sempre, que já grava o XML.
   - `400` com `erros[]` → `rejected` com o primeiro código oficial (`E0010`, `E0717`, `E0718`…) e
     mensagem saneada, como o adaptador da Nota RP faz. `403` (certificado da transmissão recusado)
     → `rejected` com `NFSE_NATIONAL_CERTIFICATE_REJECTED`: nada nasceu, a reemissão é segura e não
     gasta cinco retentativas num defeito de credencial. `500`, `5xx`, `429`, timeout e falha de rede
     → `error` recuperável (nada é afirmado; o próximo `issue` começa pelo `HEAD`).
   - `tipoAmbiente` da resposta diferente do `fiscal_environment` da tentativa → `error` com causa
     nomeada `environment_mismatch`, sem write-back de sucesso; é configuração errada de URL e
     precisa aparecer, não ser tolerada.
   - Status pull (`fetchStatus`): `GET /nfse/{chave}` `200` → `authorized` (número, data e chave
     lidos do XML); `404` → `error` (adia, **nunca** `rejected` — ADR-0098 §7); `401`/`403` → `error`.
   - **Alternativa descartada:** o consumidor gravar `authorized` direto do `201`. Economiza um ciclo,
     mas muda o write-back e quebra a ADR-0029 §2 (estado fiscal só por consulta autenticada) por
     conveniência do provedor — exatamente o que a spec proíbe. **Alternativa descartada:** carregar o
     XML no outcome de `issue` e gravá-lo no write-back: muda a porta e põe storage no consumidor; o
     custo evitado é um `GET`.
   - A latência extra é a do primeiro ciclo do pull, que o write-back de `accepted` já agenda;
     encurtá-la, se a medida pedir, é parâmetro de agendamento, não estado.

2. **Seleção pelo valor `national` de `NFSE_PROVIDER_API_VERSION`, gravado por tentativa; depois da
   primeira nota real a Nota RP sai do app.**
   - `NFSE_PROVIDER_API_VERSIONS` (`apps/api-transportada/src/shared/nfse-provider-api-version.constant.ts:4`)
     ganha `national`; o schema da variável segue só na API
     (`apps/api-transportada/src/config/environment.schema.ts:216`), que grava a versão em
     `providerConfig`; o worker roteia pela tentativa (`parseProviderApiVersion` e
     `resolveLatestIssuanceApiVersion`,
     `apps/worker-transportada/src/nfse-issuance/domain/nfse-provider-api-version.policy.ts:17` e `:26`),
     com um ramo `national` ao lado dos `if (providerApiVersion === 'v3')` de
     `apps/worker-transportada/src/nfse-issuance/infrastructure/nfse-fiscal-gateway.ts:217`. O worker
     não ganha a variável. O nome `NFSE_NATIONAL_PROVIDER_API_VERSION = 'v3'` (`…constant.ts:8`) é
     enganoso a partir daqui e é renomeado na T2.4.
   - **Remoção (T4.2b, só depois da T4.2):** saem clientes v2/v3, roteio por versão Nota RP, vínculo
     externo por `id_nota` e seus contratos; a lib não é tocada. **Pré-condição medida por consulta:
     zero nota v2/v3 em estado não terminal** (`issuing`, `pending_authorization`). Notas v2/v3 já
     autorizadas mantêm XML/PDF no storage e seguem legíveis pela API; **consulta e cancelamento
     delas passam a ser manuais no portal da Nota RP** (a ADR-0098 já previa isso para a v2).
     Tentativa sem versão ou com `v2`/`v3` que ainda chegue ao worker vira recusa fatal nomeada
     `NFSE_PROVIDER_VERSION_RETIRED`, nunca retentativa.
   - Fecha o [NEEDS CLARIFICATION] 3 da spec. A T6.2 da 250 (virada para `v3`) **não acontece**: a
     250 fecha sem a virada e a 032/T030 fecha com a nota da T4.2 desta spec.
   - **Alternativa descartada:** manter a v3 como contingência alternável. Foi recusada pelo usuário
     e custaria dois adaptadores, dois limitadores e duas famílias de contrato para um caminho que
     não seria exercitado — contingência que nunca roda não é contingência.

3. **Certificado: mesmo cofre e mesma tabela, finalidade própria `nfse`.**
   - `digital_certificates` ganha `nfse` em `CERTIFICATE_PURPOSES`
     (`apps/api-transportada/src/database/digital-certificate.schema.ts:20`, check em `:68`); o AAD
     sai do formato existente `transportada:certificate:v1:<companyId>:<certificateId>:nfse`
     (`apps/api-transportada/src/companies/application/digital-certificate-secret.service.ts:90`).
     É o precedente do MDF-e, que lê a finalidade `mdfe`
     (`apps/worker-transportada/src/mdfe-issuance/infrastructure/drizzle-mdfe-certificate.repository.ts:35`).
     O arquivo PFX pode ser o mesmo do CT-e: o operador o envia de novo para a finalidade `nfse`.
   - **Alternativa descartada:** ler o certificado `cte`. Acopla a rotação dos dois trilhos (trocar
     o A1 do CT-e derruba a NFS-e no meio de um lote) e faz o trilho de NFS-e decifrar envelope
     selado para outra finalidade, o que a ADR-0004 §7 existe para impedir. **Alternativa
     descartada:** copiar o envelope do `cte` no servidor — exige decifrar com um AAD e recifrar com
     outro, a mesma travessia de finalidade.
   - Validade: `expires_at` já existe (`digital-certificate.schema.ts:42`). Emissão nova com A1 `nfse`
     vencido é recusada na API (`409`) e no worker (`rejected` nomeado). **Alerta D-30 e D-7** por
     e-mail ao destinatário configurado (Anderson), em rotina diária do cron sobre os certificados
     ativos de toda finalidade, e selo no painel. **Quem renova: Anderson** (o A1 atual vence em
     05/11/2026). Não existe alerta de validade hoje: é trabalho novo da T1.1.
   - mTLS: o worker abre o PKCS#12 em memória e passa chave e certificado ao `fetch` do Bun por
     chamada; `Uint8Array` de PFX, senha e chave são zerados no `finally` (best effort: PEM em
     `string` fica sob o GC — limitação já aceita na ADR-0004). A saída de rede precisa alcançar as
     URLs de LCR do certificado (`E1206`/`E107`).
   - XMLDSig no **gateway da aplicação** (`nfse-national-dps.signer.ts` no worker), Enveloped sobre
     `infDPS` e `infPedReg`; biblioteca escolhida na T2.3 pelo §13 do code-standart (mantida, tipada,
     compatível com Bun). **Alternativa descartada:** publicar antes um assinador público no pacote
     fiscal — ciclo de publicação antes de qualquer prova na restrita, o mesmo argumento da ADR-0029;
     extrair ao pacote depois de provado é seguimento.
   - Nunca em log: PFX, senha, chave, DPS, NFS-e, corpo de evento. Log de recusa leva código e
     mensagem saneada (sequências longas de dígitos redigidas, como em
     `nfse_issuance_provider_outcome`).

4. **Numeração da DPS pela reserva da ADR-0005, na API, ao criar a tentativa.**
   - `fiscal_sequences` ganha o modelo `nfse_dps` em `FISCAL_MODELS`
     (`apps/api-transportada/src/database/fiscal-sequence.schema.ts:20`, check em `:54`); a sequência
     é por `(companyId, environment, model, series)`, a porta é a existente
     (`apps/api-transportada/src/companies/application/fiscal-sequence-reservation.port.ts:6`).
   - Série: coluna do perfil de emissão, faixa `00001`–`49999` (fora dela é `E0010`).
   - `reservationKey = nfse-dps:<provider_request_key>`. A reemissão ambígua copia a
     `provider_request_key` (ADR-0098 §5; coluna em `nfse.schema.ts:572`), logo recebe **o mesmo**
     `nDPS` e o mesmo `Id`, e o `HEAD` da decisão 1 acha a nota que talvez tenha nascido. Reemissão
     de DPS recusada usa chave nova e número novo: o número recusado nunca volta, e a lacuna tem
     rastro no ledger (ADR-0005 §13).
   - A reserva roda na API, na mesma transação que cria a tentativa quando o repositório aceitar a
     transação do chamador (a T1.2 confere; se não aceitar, reserva antes, idempotente pela chave). O
     `Id` (`DPS[0-9]{42}`, com `nDPS` preenchido a 15) é gravado na tentativa e congelado: o worker
     nunca numera.
   - **Alternativa descartada:** numerar no worker na hora do envio. Põe a numeração fiscal no lado
     que reentrega mensagens e separa o número da intenção que a API registrou.

5. **Ambientes: emenda à ADR-0035 — passa a haver produção restrita e produção.**
   - A ADR-0035 §1 (um endereço só) continua: **uma variável por deploy**, não um par.
     `NFSE_PROVIDER_BASE_URL` é a base da Sefin (`…/SefinNacional`); entra
     `NFSE_NATIONAL_ADN_BASE_URL` (origem do ADN, que serve `/contribuintes` e `/parametrizacao`).
     Staging aponta para `*.producaorestrita.nfse.gov.br`, produção para `*.nfse.gov.br`. Lidas na API
     (parametrização) e no worker (emissão, consulta, eventos).
   - `tpAmb` da DPS sai do `fiscal_environment` da tentativa, que a credencial NFS-e já carrega
     (`nfse.schema.ts:278` e `:568`); a resposta é conferida (decisão 1). Credencial e certificado são
     por ambiente porque cada deploy tem o próprio banco e o próprio cofre; o PFX pode ser o mesmo
     (o e-CNPJ vale nos dois ambientes).
   - A ADR-0035 §2 (NFS-e só em produção) **deixa de valer para `national`**: staging emite, em
     produção restrita, e o pull roda lá. Guarda: com `FISCAL_ENVIRONMENT=homologation`, versão
     diferente de `national` desliga o trilho de NFS-e no boot — staging nunca fala com a Nota RP real.
   - Produção emite só depois da T4.2: nota de valor mínimo, conferida no portal, com aprovação humana.

6. **Documentos: XML imutável no storage; DANFSe por renderizador próprio no worker.**
   - O XML da NFS-e (assinado pelo município) é guardado como hoje: purpose `nfse_document`
     (`apps/api-transportada/src/database/storage.schema.ts:19`), create-only, SHA-256, bytes
     originais sem reformatar (ADR-0006).
   - O PDF sai de `fetchDocument({ kind: 'pdf' })` do adaptador nacional, que renderiza o DANFSe a
     partir do XML da própria NFS-e (`pdfkit`, a mesma versão fixada na API). O pull já trata o PDF
     como conveniência que não bloqueia a autorização
     (`apps/worker-transportada/src/nfse-status-pull/application/reconcile-invoice.use-case.ts:179`): nada
     muda nele. Conteúdo: chave de acesso, número e data, prestador, tomador, discriminação, valores,
     ISS e retenções, ambiente (com tarja "SEM VALOR FISCAL" em produção restrita) e QR code da
     consulta pública — o leiaute segue a NT oficial do DANFSe quando a T2.5 a localizar.
   - **Alternativa descartada:** renderizar na API sob demanda — PDF não bloqueia o event loop da API
     (regra da API) e os v2/v3 já guardam PDF; um caminho só para todos. **Alternativa descartada:**
     adiar o PDF — o painel e o cliente já esperam o documento, e o renderizador lê um XML que já
     temos. O PDF é representação, não prova: errar o leiaute não toca o XML fiscal.

7. **Parâmetros do município lidos do ADN ao congelar o payload, nunca na transmissão.**
   - A API consulta `/parametrizacao/{codMun}/convenio`, `/{codServico}/{competencia}/aliquota`,
     `/{competencia}/retencoes` e `/{codServico}/{competencia}/regimes_especiais` **antes** da
     transação de criação (HTTP nunca dentro de transação), com timeout curto; falha →
     `503 NFSE_MUNICIPAL_PARAMETERS_UNAVAILABLE` e nada é gravado. O resultado entra no payload
     congelado com a competência e a hora da leitura.
   - Alíquota do ADN diferente da do perfil → `409 NFSE_MUNICIPAL_RATE_MISMATCH` com os dois valores;
     a API não sobrescreve o perfil em silêncio.
   - A reemissão segue a regra de congelamento do resto do payload (ADR-0098 §4): não relê o ADN por
     conta própria. **Alternativa descartada:** ler no worker na hora do envio — a reentrega
     recalcularia imposto de uma nota já decidida.

8. **Risco aberto: `aderenteEmissorNacional = 0`. A sonda T2.3b decide antes das Fases 1 e 3.**
   - Com a DPS montada e assinada (A1 vindo do arquivo local, senha digitada pelo usuário, nada em
     disco), um `POST /nfse` em produção restrita. Aceite fecha o risco para homologação; produção só
     a T4.2 prova.
   - **Se a Sefin recusar por convênio:** parar, registrar código e mensagem em `evidence.md` e voltar
     ao usuário com duas saídas — ADR "não faremos" (a v3 segue em produção, porque a remoção só vem
     depois da T4.2: regressão zero) ou refazer o escopo para o webservice ISS.Net no padrão nacional.
     Nenhuma migration da Fase 1 entra antes da sonda.

9. **Limites: limitador por processo reaproveitado, valor configurável e conservador.**
   - O `createRateLimitedFetch`
     (`apps/worker-transportada/src/nfse-issuance/infrastructure/nota-rp-rate-limit.ts:11`) ganha uma
     instância nacional no composition root, como a v3 (`apps/worker-transportada/src/main.ts:512` e
     `:595`), compartilhada por emissão e status pull, com `NFSE_NATIONAL_MIN_INTERVAL_MILLISECONDS`
     no worker (padrão 1000). `429` e `503` são recuperáveis. Assume uma réplica do worker (ADR-0098
     §8). O pull custa até três `GET /nfse/{chave}` por nota (status, XML, PDF); memorizar o XML
     dentro de uma reconciliação é permitido ao adaptador.
   - Na T4.2b o limitador **fica** (renomeado sem `nota-rp`); sai só a instância da v3.
   - **Alternativa descartada:** sem limitador até medir. Sem fonte oficial, o primeiro sinal de limite
     seria bloqueio do CNPJ em produção; 1 req/s cabe no volume de uma transportadora.
   - XMLDSig: começar por c14n 1.0, RSA-SHA1 e SHA1 (o que a nota 74 real traz) e confirmar na sonda;
     o algoritmo fica em constante única do assinador, não espalhado.

## Consequências

- **Migrations aditivas** (todas com `rollback.sql`; `make migration-test`):
  - `digital_certificates_purpose_check` passa a aceitar `nfse`; `fiscal_sequences_model_check`
    passa a aceitar `nfse_dps`. O rollback restaura o check anterior e falha, guardado, se houver
    linha com o valor novo (após dados reais é roll-forward, ADR-0005).
  - `nfse_emission_profiles.dps_series` (inteiro, nulável, check 1–49999); exigido pela API só quando
    a versão for `national`.
  - `nfse_issuance_attempts.dps_id` (`text`, nulável, check `^DPS[0-9]{42}$` quando presente) e
    `fiscal_sequence_reservation_id` (nulável, FK ao ledger). Sem índice único em `dps_id`: a
    reemissão ambígua o repete de propósito.
  - Parâmetros municipais e versão `national` vão no payload/`providerConfig` (jsonb), sem coluna.
- **API:** valor `national`, cadastro do A1 `nfse` com validade e alerta, reserva de `nDPS`, leitura
  da parametrização, base do ADN no schema de env, guarda de staging.
- **Worker:** `nfse-national.client.ts` + assinador + ramo `national` nos dois gateways, instância
  nacional do limitador, renderizador do DANFSe (`pdfkit` como dependência nova, justificada pelo §13),
  recusa `NFSE_PROVIDER_VERSION_RETIRED` depois da T4.2b.
- **Cron:** rotina de alerta de validade do A1; `cron-nfse` passa a subir em staging.
- **Painel:** tela do certificado/ambiente da NFS-e com validade e estado (Fase 3); a tela de emissão
  não muda.
- **Fora:** emissão por decisão judicial, NFS-e de tomador no exterior, intermediário, obra/evento,
  substituição (`105102`) e análise fiscal (`105104`); vínculo de nota emitida fora do sistema pela
  `chaveAcesso` (seguimento depois da T4.2b); limitador distribuído; outros municípios.

## Segurança

Nenhum segredo novo em claro: A1 e senha no envelope da ADR-0004 com finalidade própria. XML, DPS e
evento nunca em fila, log, auditoria ou erro (ADR-0006 §12). Rejeições logam código e mensagem
saneada. A conferência de `tipoAmbiente` e a guarda de staging impedem nota de produção a partir de
staging.

## O que o `architect` precisa validar

1. `HEAD` antes de todo `POST` como única defesa de duplicidade, e `403` como `rejected`.
2. A divergência de alíquota ADN × perfil como `409` (e não ADN vence).
3. Finalidade `nfse` com reenvio do PFX, em vez de ler o certificado `cte`.
4. DANFSe renderizado no worker, e a ausência de DANFSe oficial como risco de leiaute aceito.
