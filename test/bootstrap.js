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
    fixture: "nock.json" //When using nocks, indicates the name of the fixture in test/fixtures that will be used.
});

before(function () {
    //Define globals to reduce duplication.

    global.should = chai.should();
    global.expect = chai.expect;
    global.spRemoteAuth = spRemoteAuth;
    global._ = _;

    //Read test settings from config file.
    let settingsBuffer = fs.readFileSync(path.join(__dirname, "fixtures", argv.settings));
    global.testSettings = JSON.parse(String(settingsBuffer).replace(/^\ufeff/g, ''));

    //Initialize nocks

    //If we're not live, setup the nock from the pre-recorded fixture.
    if (!argv.live) {
        let nockDefs = nock.loadDefs(path.join("test", "fixtures", argv.fixture));

        //Post-process the nock file and replace with values in settings.
        for (let def of nockDefs) {
            
            if (def.scope === "https://tenant.sharepoint.com:443")
                def.scope = global.testSettings.valid.url;

            if (_.isString(def.response)) {
                def.body = mustache.render(def.body, global.testSettings);
            }

            //Supply the current date in the FormDigestValue
            if (def.path == "/_api/contextinfo") {
                let formDigestValue = _.get(def.response, "d.GetContextWebInformation.FormDigestValue");
                formDigestValue = mustache.render(formDigestValue, {
                    currentDate: new Date()
                });
                _.set(def.response, "d.GetContextWebInformation.FormDigestValue", formDigestValue);
            }
        }

        //  Load the nocks from pre-processed definitions.
        let nocks = nock.define(nockDefs);
    }

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