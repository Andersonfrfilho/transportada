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

## Decisões do usuário (07/10/2026)

- Primeiro a v3 (spec 250); **depois** a troca para a integração nacional gratuita (esta spec).

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
