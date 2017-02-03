"use strict";

/**
 * Module dependencies.
 */

const mochaGenerators = require('mocha-generators');
const chai = require('chai');
const asPromised = require('chai-as-promised');

const should = chai.should();
const expect = chai.expect;

const fs = require("fs");
const path = require("path");
const mkdirp = require('mkdirp');
const spRemoteAuth = require("../lib");
const _ = require("lodash");
const mustache = require("mustache");
const nock = require("nock");
const argv = require('minimist')(process.argv.slice(2));

_.defaults(argv, {
    live: false, //True to not use nocks
    record: false, //True to record
    recordOutput: "nock-test.json", //When recording completes, output will be saved in this file in the test/tmp folder.
    settings: "settings-test.json", //Name of the settings file to use.
});

let postProcessNockFixture = function (fixturePath) {
    let nockDefs = nock.loadDefs(path.join("test", "fixtures", fixturePath));

    //Post-process the nock file and replace with values in settings.
    for (let def of nockDefs) {

        if (def.scope === "https://tenant.sharepoint.com:443") {
            def.scope = global.testSettings.valid.url;

            //Supply the current date in the FormDigestValue
            def.response = mustache.render(JSON.stringify(def.response), _.merge(global.testSettings, {
                currentDate: new Date()
            }));

            if (_.startsWith(def.path, "/_api/web/")) {
                def.options = def.options || {};
                def.options.filteringRequestBody = function () {
                    return "*";
                };
            }
        }
        else {
            if (_.isString(def.response)) {
                def.body = mustache.render(def.body, global.testSettings);
            }
        }
    }

    return nockDefs;
};

before(function () {
    //Define globals to reduce duplication.

    global.should = chai.should();
    global.expect = chai.expect;
    global.spRemoteAuth = spRemoteAuth;
    global.nock = nock;
    global.postProcessNockFixture = postProcessNockFixture;
    global.isLive = argv.live;
    global._ = _;

    //Read test settings from config file.
    let settingsBuffer = fs.readFileSync(path.join(__dirname, "fixtures", argv.settings));
    global.testSettings = JSON.parse(String(settingsBuffer).replace(/^\ufeff/g, ''));

    //If record and live are truthy, start recording.
    if (!!argv.record && !!argv.live) {
        nock.recorder.rec({
            output_objects: true,
            dont_print: true,
            //enable_reqheaders_recording: true
        });
    }

});

after(function () {

    //If record is truthy and we're running live, save the output.
    if (!!argv.record && !!argv.live) {

        mkdirp.sync(path.join(__dirname, "tmp"));

        let nockCallObjects = nock.recorder.play();

        let regExpEscape = function (s) {
            return String(s).replace(/([-()\[\]{}+?*.$\^|,:#<!\\])/g, '\\$1').
                replace(/\x08/g, '\\x08');
        };

        for (let callObject of nockCallObjects) {
            if (callObject.scope === testSettings.valid.url + ":443") {
                callObject.scope = "https://tenant.sharepoint.com:443";

                if (callObject.body)
                    callObject.body = "*";
            }
            else if (callObject.scope === "https://login.microsoftonline.com:443") {
                if (callObject.body) {
                    callObject.body = callObject.body.replace(new RegExp(regExpEscape(testSettings.valid.username, "gm")), "{{{valid.username}}}");
                    callObject.body = callObject.body.replace(new RegExp(regExpEscape(testSettings.valid.password, "gm")), "{{{valid.password}}}");
                    callObject.body = callObject.body.replace(new RegExp(regExpEscape(testSettings.valid.url, "gm")), "{{{valid.url}}}");
                    callObject.body = callObject.body.replace(new RegExp(regExpEscape(testSettings.invalid.username, "gm")), "{{{invalid.username}}}");
                    callObject.body = callObject.body.replace(new RegExp(regExpEscape(testSettings.invalid.password, "gm")), "{{{invalid.password}}}");
                    callObject.body = callObject.body.replace(new RegExp(regExpEscape(testSettings.invalid.url, "gm")), "{{{invalid.url}}}");
                }
            }

            //Rawheaders nonsense.
            // if (callObject.rawHeaders) {
            //     callObject.headers = {};

            //     for (let i = 0; i < callObject.rawHeaders.length; i += 2) {
            //         let key = callObject.rawHeaders[i].toLowerCase();
            //         //Allow for multiple cookies, such as Set-Cookie
            //         if (callObject.headers[key]) {
            //             if (_.isArray(callObject.headers[key])) {
            //                 callObject.headers[key].push(callObject.rawHeaders[i + 1]);
            //             }
            //             else {
            //                 let tmp = callObject.headers[key];
            //                 callObject.headers[key] = [];

            //                 callObject.headers[key].push(tmp);
            //                 callObject.headers[key].push(callObject.rawHeaders[i + 1]);
            //             }
            //         }
            //         else {
            //             callObject.headers[key] = callObject.rawHeaders[i + 1];
            //         }
            //     }
            //     delete callObject.rawHeaders;
            // }

            if (callObject.headers) {
                for (let header in callObject.headers) {
                    let headerLower = header.toLowerCase();
                    switch (headerLower) {
                        case "expires":
                        case "last-modified":
                        case "date":
                            delete callObject.headers[header];
                            break;
                        case "x-requestdigest":
                            callObject.headers[header] = "0x12345,{{{currentDate}}}";
                            break;
                        case "set-cookie":
                            if (_.isArray(callObject.headers[header])) {
                                for(let i = 0; i < callObject.headers[header].length; i++) {
                                    let subHeader = callObject.headers[header][i];
                                    subHeader = subHeader.replace(new RegExp("rtFa=.*?;", "g"), "rtFa=12345;");
                                    subHeader = subHeader.replace(new RegExp("FedAuth=.*?;", "g"), "FedAuth=12345;");
                                    callObject.headers[header][i] = subHeader;
                                };
                            } else {
                                callObject.headers[header] = callObject.headers[header].replace(new RegExp("rtFa=.*?;", "g"), "rtFa=12345;");
                                callObject.headers[header] = callObject.headers[header].replace(new RegExp("FedAuth=.*?;", "g"), "FedAuth=12345;");
                            }
                            break;
                    }
                }

            //     //The flip-side of the rawheaders nonsense.
            //     callObject.rawHeaders = [];
            //     for (let header in callObject.headers) {
            //         if (_.isArray(callObject.headers[header])) {
            //             for(let subHeader of callObject.headers[header]) {
            //                 callObject.rawHeaders.push(header);
            //                 callObject.rawHeaders.push(subHeader);
            //             }
            //         }
            //         else {
            //             callObject.rawHeaders.push(header);
            //             callObject.rawHeaders.push(callObject.headers[header]);
            //         }
            //     }
            //     delete callObject.headers;
            }

            if (callObject.response) {
                let formDigestValue = _.get(callObject.response, "d.GetContextWebInformation.FormDigestValue");
                if (formDigestValue) {
                    _.set(callObject.response, "d.GetContextWebInformation.FormDigestValue", "0x12345,{{{currentDate}}}");
                }

                let timeCreated = _.get(callObject.response, "d.TimeCreated")
                if (timeCreated) {
                    _.set(callObject.response, "d.TimeCreated", "{{{currentDate}}}");
                }

                let timeLastModified = _.get(callObject.response, "d.TimeLastModified")
                if (timeCreated) {
                    _.set(callObject.response, "d.TimeLastModified", "{{{currentDate}}}");
                }

                let strResponse = JSON.stringify(callObject.response);
                strResponse = strResponse.replace(new RegExp(testSettings.valid.url, "g"), "{{{valid.url}}}");
                callObject.response = JSON.parse(strResponse);
            }
        }

        fs.writeFileSync(path.join(__dirname, "tmp", argv.recordOutput), JSON.stringify(nockCallObjects, null, 2));
    }
});