# Feature 251 — A NFS-e sai direto pelo Emissor Nacional (gratuito)

## Problema e resultado

Depois da spec 250 (Nota RP v3), a emissão ainda passa por um intermediário: a Nota RP recebe nosso
pedido, monta a DPS, assina com o certificado da empresa **guardado por ela** e envia ao ambiente
nacional. O Emissor Nacional de NFS-e (Sefin Nacional / ADN, gov.br) é **gratuito para o contribuinte**
e Ribeirão Preto já está no padrão nacional (suporte da Nota RP, 07/10/2026; `ambGer 1`, `tpEmis 2`
na nota 74).

**Resultado:** o worker monta a DPS 1.01, assina com o certificado A1 da própria transportadora
(já no cofre da ADR-0004), envia por mTLS à API de Contribuintes do Sistema Nacional e recebe a
NFS-e — sem terceiro no meio, sem dependência da disponibilidade/preço/documentação da Nota RP, e com
ambiente de **homologação** (produção restrita) onde hoje não existe nenhum.

A porta `NfseFiscalGateway`, o outbox, o consumidor e o write-back **não mudam**: troca-se o
adaptador de novo, como a ADR-0029 previu.

## Fatos conhecidos (07/10/2026)

- Documentação oficial: <https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica> (manual do
  contribuinte "Emissor Público API — Sistema Nacional NFS-e", v1.2 out/2025).
- Fluxo: o emissor envia ao Sefin Nacional um XML **DPS** (Declaração de Prestação de Serviço); o
  sistema valida, aplica os parâmetros do município e do CGNFS-e e devolve a NFS-e.
- Consulta de uma DPS só é permitida ao titular da conexão (certificado do prestador, tomador ou
  intermediário): a identidade da conexão **é** o certificado.
- Ambiente de testes: `https://adn.producaorestrita.nfse.gov.br/contribuintes/docs/index.html`
  (Swagger). O contrato exato (rotas, compactação, assinatura) está nele — **não** no PDF.
- Formato da DPS e da NFS-e visto na nota 74: XML `DPS versao="1.01"`, assinatura XMLDSig
  (c14n 1.0, RSA-SHA1, SHA1) com X509 embutido, `infDPS` com `Id` `DPS` + cMun + tipo + CNPJ + série +
  nDPS. O **número da DPS** (`nDPS`) e a **série** são do prestador: sequência nossa.
- Já existe no repositório o cofre de certificado A1 (ADR-0004), a reserva idempotente de número
  fiscal (ADR-0005) e o XML fiscal imutável (ADR-0006) — todos do CT-e e reaproveitáveis.

## Levantamento de 08/10/2026 (fontes públicas; o Swagger ainda não foi lido)

- **URLs oficiais** (<https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao>):
  ADN contribuintes — produção restrita `https://adn.producaorestrita.nfse.gov.br/contribuintes/docs/index.html`,
  produção `https://adn.nfse.gov.br/contribuintes/docs/index.html`; Sefin Nacional — produção restrita
  `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/docs/index`, produção
  `https://sefin.nfse.gov.br/SefinNacional/docs/index`. Qual dos dois recebe a DPS é da T0.3.
- **Transporte:** HTTPS TLS ≥ 1.2 com **autenticação mútua**; certificado ICP-Brasil **A1 ou A3**, tipo
  e-CNPJ ou e-aplicação (anexo II, "Guia para utilização das APIs"). Só A1 serve ao worker (A3 pede token
  físico). Fontes de terceiros dizem XML assinado + GZip + Base64 em corpo JSON; as versões do anexo II
  divergem entre síncrono (v1.1) e assíncrono (v1.02) — **o Swagger decide**, não os PDFs.
- **Ribeirão Preto** migrou para o padrão nacional (layout ABRASF deixou de valer em 01/07/2026; só a DPS
  no padrão novo é aceita — fonte de fornecedor, não da Prefeitura). Isso **não prova** que o contribuinte
  emite direto: segue o [NEEDS CLARIFICATION] 1.
- **Gratuidade:** o emissor público é gratuito para o contribuinte segundo guias de 2026; o portal
  gov.br não a afirma por escrito. Registrar a fonte oficial na T0.2.
- **Fora do ar na tentativa:** o Swagger da produção restrita respondeu `socket hang up` em 08/10/2026
  — a T0.3 repete a leitura (talvez exija o certificado já no TLS).

## Decisões do usuário

- 07/10/2026 — Primeiro a v3 (spec 250); **depois** a troca para a integração nacional gratuita (esta spec).
- 08/10/2026 — Emitir **direto pelo Emissor Nacional, sem provedor**. A Nota RP deixa de ser o caminho;
  se ela fica como contingência é decisão da T0.5. A T6.2 da 250 (virada para `v3` em produção) fica
  suspensa até a T0.2: se o município aceita emissão direta e a homologação prova a DPS, a virada vai
  direto ao `national` e a 250 fecha sem a virada.

## Decisões por delegação

- **Provedor por variável de ambiente**, ao lado de `v2`/`v3`: `NFSE_PROVIDER_API_VERSION=national`.
  Reversível; uma transportadora por deploy (ADR-0021).
- **Numeração da DPS pelo nosso cofre** (ADR-0005): `nDPS` nunca repete nem volta, mesmo com
  reentrega do worker.
- **Homologação existe** → a ADR-0035 ("um ambiente só") ganha emenda: `NFSE_PROVIDER_BASE_URL`
  aponta para produção restrita em staging e produção em produção. Credencial por ambiente.
- **Sem fila nova e sem estado novo**: `accepted`→`pending_authorization`→pull continua; se a
  resposta nacional for síncrona com a NFS-e, o adaptador devolve `accepted` e o pull a confirma
  na mesma rodada (não se muda o write-back por conveniência do provedor).

## Requisitos (a detalhar depois da Fase 0)

1. Montar a DPS 1.01 só por renomeação/formatação do payload congelado + parâmetros do município.
2. Assinar a DPS com o A1 da empresa (XMLDSig), sem expor chave nem senha; zerar buffers.
3. Enviar por mTLS à API de Contribuintes; guardar o XML da NFS-e e o PDF (DANFSe) no storage.
4. Consultar, cancelar (evento de cancelamento assinado) e baixar documentos pelos endpoints
   nacionais; classificar rejeição × recuperável como no adaptador da Nota RP.
5. Staging emite em produção restrita; produção só depois de aprovação humana.
6. Nenhum segredo/certificado em log; mensagens de rejeição saneadas.

## Fora do escopo

- Outros municípios que não tenham aderido ao padrão nacional.
- Reforma tributária além do que a DPS 1.01 já exige (grupo `IBSCBS` fica como o município pedir).
- NFS-e de tomador no exterior, intermediários, obra/evento (campos condicionais da v3).

## [NEEDS CLARIFICATION]

1. **O município aceita emissão direta?** Ribeirão Preto está no padrão nacional, mas a Nota RP
   falou também em "webservice antigo ativo" (Nota Control). Confirmar, pela consulta de parâmetros
   municipais da API nacional, que RP **convênio/adesão** permite o contribuinte emitir direto.
2. **Certificado.** A transportadora já tem e-CNPJ A1? (O da nota 74 vence em 05/11/2026 — o
   certificado que a Nota RP usa hoje.) Quem cadastra e renova o A1 no nosso cofre, e o A1 do
   CT-e é o mesmo?
3. **Papel da Nota RP depois da troca**: some, ou fica como contingência (`NFSE_PROVIDER_API_VERSION`
   alternável)? Decide se v3 e nacional convivem no código ou a v3 é removida.
4. **Contrato exato** (rotas, GZip/Base64, assinatura, códigos de erro, limites): sai da Fase 0, lendo
   o Swagger da produção restrita — não deste PDF.

## Decisões do usuário (08/10/2026, durante a Fase 0)

- **Nota RP sai do app e fica só na lib** (`@adatechnology/fiscal-provider`, repositório
  `adatechnology-packages`). Nada de v2/v3 no `api`/`worker`/`cron` depois da primeira nota real pelo nacional;
  não há contingência no app. Fecha o [NEEDS CLARIFICATION] 3; a T6.2 da 250 **não é cancelada: fica
  suspensa até a sonda T2.3b** e é o plano B se a sonda falhar (a produção está na v2, que já recusa a
  empresa — ADR 0099 §2 e §8, revisão do architect).
  A reversibilidade passa a ser o git (a remoção é uma task isolada, depois da prova real).
- **O A1 de produção da transportadora pode ser usado** para leitura em produção restrita (Swagger e
  parâmetros municipais, só GET). Emissão real continua só na T4.2. **Anderson renova o A1** (vence em
  05/11/2026) e o repassa ao cofre; o alerta D-30 avisa o Anderson.

## Prazo regulatório (08/10/2026)

A Resolução CGSN 191/2026 obriga as optantes do Simples Nacional a emitir NFS-e pelo Emissor Nacional (web ou API) a
partir de **01/11/2026** (fontes contábeis; conferir no DOU). A transportadora é Simples. Isso torna esta spec
**prazo-crítico**: o caminho por provedor (Nota RP) deixa de ser o destino, e a sonda T2.3b decide se o cadastro
municipal (`aderenteEmissorNacional=0`) bloqueia a emissão direta antes de qualquer migration.
