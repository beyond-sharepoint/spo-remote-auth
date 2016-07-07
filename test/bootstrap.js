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
                def.options.filteringRequestBody = function() {
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
            enable_reqheaders_recording: true
        });
    }

});

after(function () {

    //If record is truthy and we're running live, save the output.
    if (!!argv.record && !!argv.live) {

        mkdirp.sync(path.join(__dirname, "tmp"));

        let nockCallObjects = nock.recorder.play();

        fs.writeFileSync(path.join(__dirname, "tmp", argv.recordOutput), JSON.stringify(nockCallObjects, null, 2));
    }
});