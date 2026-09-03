# ADR-0057 — O comprovante é configurável, e o documento do recebedor entra com envelope

- **Data:** 2026-09-03
- **Estado:** aceita
- **Revisa:** ADR-0045 §7 (e o eco dela na ADR-0056 §4)
- **Spec:** 082

## Contexto

A ADR-0045 §7 decidiu não colher CPF do recebedor: dado pessoal novo custa criptografia, retenção e
trilha, e a disputa se resolve no canhoto. O que mudou não é o custo — é quem decide. Há contratante
que exige documento no comprovante e contratante que dispensa; uma regra fixa no código erra para um
dos dois.

## Decisão

1. **O painel decide o formulário do comprovante.** `company_delivery_proof_settings` guarda, por
   empresa, o estado de cada campo — `receiverName`, `receiverDocument`, assinatura, foto — em
   `required | optional | off`; `delivery_proof_setting_overrides` guarda exceções por CNPJ do
   destinatário (o CNPJ vence o geral). O painel edita na tela de viagens, perto do efeito.
2. **O app obedece à configuração, não a conhece.** Os campos resolvidos viajam no snapshot de
   `GET /me/trips/current`; o app não ganha rota de settings.
3. **O documento paga o custo que a 0045 nomeou.** `receiverDocument` persiste criptografado
   (envelope A256GCM, AAD `transportada:delivery-proof:v1:${companyId}:${proofId}`), sai **mascarado
   em toda leitura** (`***.938.570-**`), nunca em log (security.md §1), e não tem busca por valor —
   não há índice cego: ninguém consulta comprovante por CPF.
4. **O padrão de fábrica é a 0045.** Instalação nova nasce com `receiverDocument: off` — colher
   documento é escolha explícita de quem opera, nunca default.

## Consequências

- O campo do mockup existe onde o contratante exige e some onde não exige.
- Quem liga o campo assume a retenção: o documento vive com o comprovante e morre com ele.
- Leitor futuro do valor em claro precisa abrir envelope — que é o freio desejado.
