# syntax=docker/dockerfile:1
# Imagem própria em vez do container cru: o `kc.sh build` fica no build da imagem, não no boot,
# e o realm entra versionado no git em vez de ser configurado à mão em cada ambiente.
FROM quay.io/keycloak/keycloak:26.5.2@sha256:fb31a59deb46f746f2aaa25adc5da39ceccac4fd22d36a519562b0bf02e8df20 AS build
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build
# O tema de login carrega a identidade do app na única tela que aparece antes da sessão existir.
COPY --chown=1000:0 deploy/keycloak/theme /opt/keycloak/themes/transportada
# ⚠️ O Keycloak serve os recursos do tema por 30 dias sob a versão do servidor, que não muda com o
# tema. O `?v=` do `template.ftl` leva o hash do conteúdo — caminho e bytes, em ordem fixa —, então
# toda mudança do tema troca a URL sozinha. Carimbo de hora, número à mão ou commit mudariam sem
# mudança no tema, ou deixariam de mudar com ela.
WORKDIR /opt/keycloak/themes/transportada
RUN version="$(find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -c1-12)" \
  && sed -i "s/^resourcesVersion=.*/resourcesVersion=${version}/" login/theme.properties \
  && grep -qx "resourcesVersion=${version}" login/theme.properties

FROM quay.io/keycloak/keycloak:26.5.2@sha256:fb31a59deb46f746f2aaa25adc5da39ceccac4fd22d36a519562b0bf02e8df20 AS runtime
COPY --from=build /opt/keycloak/ /opt/keycloak/
# O import resolve ${VAR} pelo ambiente e ignora realm já existente: reimportar não sobrescreve nada.
COPY deploy/keycloak/realm.json /opt/keycloak/data/import/realm.json

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
