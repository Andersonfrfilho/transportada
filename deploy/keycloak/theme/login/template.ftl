<#--
  Copyright (c) 2026 Ada Technology. MIT License.

  O tema herda de `base`, não de `keycloak.v2`: o PatternFly trazia o próprio layout, os cantos
  arredondados e a moldura de cartão, e nenhuma folha de estilo nossa vencia isso sem virar uma
  briga de especificidade. Aqui o markup é nosso e o CSS estiliza elemento por elemento.
-->
<#import "footer.ftl" as loginFooter>
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html lang="${lang}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${msg("loginTitle",(realm.displayName!'TransportAdA'))}</title>
    <#-- O ícone é cópia por valor de `apps/frontend-transportada/public/icons/`: o tema não serve
         arquivo da app, e sem ele a aba do login abre com o desenho genérico do navegador. -->
    <link rel="icon" href="${url.resourcesPath}/img/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${url.resourcesPath}/img/icon-192.png" />
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript" defer></script>
        </#list>
    </#if>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <#-- Mantém as abas em sincronia: entrar numa recarrega as outras que estão nesta tela. -->
    <script type="module">
        import { startSessionPolling } from "${url.resourcesPath}/js/authChecker.js";

        startSessionPolling(
            "${url.ssoLoginInOtherTabsUrl?no_esc}"
        );
    </script>
    <#if authenticationSession??>
        <script type="module">
            import { checkAuthSession } from "${url.resourcesPath}/js/authChecker.js";

            checkAuthSession(
                "${authenticationSession.authSessionIdHash}"
            );
        </script>
    </#if>
</head>

<body class="${bodyClass}" data-page-id="login-${pageId}">
<main class="gate">
    <section class="brand" aria-label="${realm.displayName!'TransportAdA'}">
        <p class="brand-wordmark">TransportAdA</p>
        <p class="brand-description">${msg("transportadaTagline")}</p>
        <p class="brand-installation">
            <span>${msg("transportadaInstallation")}</span>
            <strong>${realm.displayName!''}</strong>
        </p>
    </section>

    <div class="panel">
        <#if auth?has_content && auth.showUsername() && !auth.showResetCredentials()>
            <#nested "show-username">
            <p class="panel-attempt">
                <span id="kc-attempted-username">${auth.attemptedUsername}</span>
                <a id="reset-login" href="${url.loginRestartFlowUrl}">${msg("restartLoginTooltip")}</a>
            </p>
        </#if>

        <h1 id="kc-page-title"><#nested "header"></h1>

        <#if displayRequiredFields>
            <p class="panel-required"><span class="required">*</span> ${msg("requiredFields")}</p>
        </#if>

        <#-- Ação iniciada pelo app não mostra aviso de que a ação precisa ser concluída. -->
        <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
            <p class="notice notice-${message.type}" <#if message.type = 'error'>role="alert"</#if>>
                ${kcSanitize(message.summary)?no_esc}
            </p>
        </#if>

        <#nested "form">

        <#if auth?has_content && auth.showTryAnotherWayLink()>
            <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post">
                <input type="hidden" name="tryAnotherWay" value="on"/>
                <button class="action action-quiet" id="try-another-way" type="submit">${msg("doTryAnotherWay")}</button>
            </form>
        </#if>

        <#nested "socialProviders">

        <#if displayInfo>
            <div id="kc-info" class="panel-footnote">
                <#nested "info">
            </div>
        </#if>

    </div>

    <#-- O rodapé é da página, não do cartão: o `base` o chama dentro do painel, e ali ele lê como
         parte do formulário. -->
    <@loginFooter.content/>
</main>
</body>
</html>
</#macro>
