"use strict";
const fs = require("fs");
const path = require("path");
const request = require("request");
const mustache = require("mustache");
const moment = require("moment");
const Promise = require("bluebird");
const co = require("bluebird-co");
const _ = require("lodash");
const url = require("url");
const xmlParser = Promise.promisify(require('xml2js').parseString);

const querystring = require("querystring");

const SPSTokenEndpointUrl = "https://login.microsoftonline.com/extSTS.srf";
const TenantAccessTokenServicePath = "/_forms/default.aspx?wa=wsignin1.0";
const ContextInfoServicePath = "/_api/contextinfo";

Promise.promisifyAll(request);

module.exports = (function () {

    /**
     * Obtain the security token from the SharePoint Security token Service
     * 
     * @param tenantDomain {string} The tenant SharePoint domain to request a security token for
     * @param username {string} The username to authenticate with
     * @param password {string} The secret associated with the username
     * 
     * @returns {string} The security token returned by the service
     */
    let obtainSecurityToken = function* (tenantDomain, username, password) {

        let saml = fs.readFileSync(path.join(__dirname, "SAMLTemplate.xml"), "utf8");
        saml = mustache.render(saml, {
            username,
            password,
            tenantDomain
        });

        let stsResponse = yield request.postAsync({
            url: SPSTokenEndpointUrl,
            body: saml
        });

        if (stsResponse.statusCode !== 200) {
            switch (stsResponse.statusCode) {
                case 403:
                    let errorMessage = querystring.parse(stsResponse.headers["x-msdavext_error"]);
                    errorMessage = Object.keys(errorMessage)[0];
                    throw Error(errorMessage);
                default:
                    throw Error(stsResponse.statusMessage);
            }
        }

        let responseData = yield xmlParser(stsResponse.body, { trim: true, explicitArray: false });
        let fault = _.get(responseData, "S:Envelope.S:Body.S:Fault");

        if (fault) {
            throw Error(_.get(responseData, "S:Envelope.S:Body.S:Fault.S:Detail.psf:error.psf:internalerror.psf:text"));
        }
        
        return _.get(responseData, "S:Envelope.S:Body.wst:RequestSecurityTokenResponse.wst:RequestedSecurityToken.wsse:BinarySecurityToken._");
    };

    /**
     * Obtain an access token to the specified tenant domain using a pre-obtained security token.
     * 
     * @param tenantDomain {string} The tenant SharePoint domain to request an access token
     * @param securityToken {string} The security token returned by the SharePoint Security Token endpoint
     * 
     * @returns {object} An object that contains rtFA and fedAuth properties that contain corresponding values returned by the SharePoint Tenant's Access Token service endpoint.
     */
    let obtainAccessToken = function* (tenantDomain, securityToken) {

        let tenantAccessTokenServiceUrl = tenantDomain + TenantAccessTokenServicePath;

        let j = request.jar();
        let atsResponse = yield request.postAsync({
            url: tenantAccessTokenServiceUrl,
            body: securityToken,
            jar: j
        });

        if (atsResponse.statusCode !== 302) {
            switch (atsResponse.statusCode) {
                default:
                    throw Error(atsResponse.statusMessage);
            }
        }

        let cookies = j.getCookies(tenantAccessTokenServiceUrl);
        let rtFaCookie = _.find(cookies, { key: "rtFa" });
        let FedAuthCookie = _.find(cookies, { key: "FedAuth" });

        if (!rtFaCookie || !FedAuthCookie)
            throw Error("Access Token Service did not return the expected headers. Ensure the specified security token is valid.");

        return {
            rtFa: rtFaCookie.value,
            FedAuth: FedAuthCookie.value
        };
    };

    /**
     * Obtain a SharePoint context info object using the specified rtFA and FedAuth values. 
     * 
     * @param tenantDomain {string} The tenant SharePoint domain to request a access token
     * @param rtFa {string} The rtFA cookie value returned by the Access Token Service
     * @param fedAuth {string} The fedAuth cookie value returned by the Access Token Service
     * 
     * @returns {object} The ContextInfo object returned by the SharePoint Tenant's ContextInfo service endpoint.
     */
    let obtainContextInfo = function* (tenantDomain, rtFa, fedAuth) {

        let tenantAccessTokenServiceUrl = tenantDomain + ContextInfoServicePath;

        let contextInfoResponse = yield request.postAsync({
            url: tenantAccessTokenServiceUrl,
            headers: {
                "Accept": "application/json;odata=verbose",
                "Content-Type": "application/json;odata=verbose",
                "Cookie": `rtFa=${rtFa}; FedAuth=${fedAuth}`,
            },
            json: true
        });

        if (contextInfoResponse.statusCode !== 200) {
            switch (contextInfoResponse.statusCode) {
                default:
                    throw Error(contextInfoResponse.statusMessage);
            }
        }

        let contextInfo = _.get(contextInfoResponse.body, "d.GetContextWebInformation");
        if (!contextInfo)
            throw Error("Unexpected Response from contextinfo service.");

        let expiresDateString = contextInfo.FormDigestValue.split(",")[1];
        contextInfo.expires = moment(new Date(expiresDateString)).add(1800, "seconds").toDate();
        return contextInfo;
    };

    /**
     * Given a contextInfo object, returns or renews it.
     * 
     * @param contextInfo {object} A context info object to verify
     * 
     * @returns {object} The context info passed in or a new contextInfo object
     */
    let ensureContextInfo = function* (tenantDomain, rtFa, fedAuth, currentContextInfo) {
        if (!currentContextInfo)
            throw Error("Context Info must be supplied.");

        if (!moment(currentContextInfo.expires).isBefore(moment()))
            return currentContextInfo;

        return yield obtainContextInfo(tenantDomain, rtFa, fedAuth);
    };

    /**
     * Performs the authentication flow to the specified tenant domain with the specified credentials.
     * Returns an object that contains the contextInfo and a function that can be used to perform authenticated requests.
     * 
     * @param tenantDomain {string} The tenant SharePoint domain to request a access token
     * @param username {string} The username to authenticate with
     * @param password {string} The secret associated with the username
     */
    let authenticate = function* (tenantDomain, username, password) {

        if (_.isObject(tenantDomain)) {
            username = tenantDomain.username;
            password = tenantDomain.password;
            tenantDomain = tenantDomain.tenantDomain;
        }

        if (!tenantDomain)
            throw Error("A Tenant Domain must be specified.");

        if (!username)
            throw Error("A username must be specified.");

        if (!password)
            throw Error("A password must be specified.");

        //Normalize the tenantDomain
        let tenantDomainUrl = url.parse(tenantDomain);
        tenantDomain = `${tenantDomainUrl.protocol}//${tenantDomainUrl.hostname}`;

        let securityToken = yield obtainSecurityToken(tenantDomain, username, password);

        let accessTokenResult = yield obtainAccessToken(tenantDomain, securityToken);

        let contextInfoResult = yield obtainContextInfo(tenantDomain, accessTokenResult.rtFa, accessTokenResult.FedAuth);

        let defaultSPRequest = request.defaults({
            baseUrl: contextInfoResult.SiteFullUrl,
            headers: {
                "Accept": "application/json;odata=verbose",
                "Content-Type": "application/json;odata=verbose",
                "X-RequestDigest": contextInfoResult.FormDigestValue,
                "Cookie": `rtFa=${accessTokenResult.rtFa}; FedAuth=${accessTokenResult.FedAuth}`,
            },
            json: true
        });

        Promise.promisifyAll(defaultSPRequest);

        return {
            contextInfo: contextInfoResult,
            ensureContextInfo: function () {
                contextInfoResult = ensureContextInfo(tenantDomain, accessTokenResult.rtFa, accessTokenResult.FedAuth, contextInfoResult);
                return contextInfoResult;
            },
            request: defaultSPRequest,
            requestAsync: Promise.promisify(defaultSPRequest)
        }
    }

    let authenticateWrapper = co.wrap(authenticate);
    return Object.assign(authenticateWrapper, {
        authenticate: co.wrap(authenticate)
    });
})();

//TODO: If the following error message occurs, auto-refresh the security token and try the operation again (or better)
//The security validation for this page has timed out. Click Back in your Web browser, refresh the page, and try your operation again.  