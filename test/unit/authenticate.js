"use strict";

require('mocha-generators').install();
const moment = require("moment");

describe('spo-remote-auth', function () {
    describe('authenticate', function () {

        before(function () {
            //If we're not live, setup the nock from the pre-recorded fixture.
            if (!isLive) {
                let nockDefs = postProcessNockFixture("nock-authenticate.json");
                //  Load the nocks from pre-processed definitions.
                let nocks = nock.define(nockDefs);
            }
        });

        it('should contain an authenticate method', function* () {
            expect(spRemoteAuth.authenticate).to.be.a("function");
        });

        it('should fail with invalid user', function* () {
            let thrown = false;
            let message = "";

            try {
                var result = yield spRemoteAuth.authenticate(testSettings.invalid.url, testSettings.invalid.username, testSettings.invalid.password);
            }
            catch (ex) {
                thrown = true;
                message = ex.message;
            }

            expect(thrown).to.be.true;
            expect(message).to.be.equal("The specified member name is either invalid or empty.");
        });

        it('should fail with invalid password', function* () {
            let thrown = false;
            let message = "";

            try {
                var result = yield spRemoteAuth.authenticate(testSettings.valid.url, testSettings.valid.username, testSettings.invalid.password);
            }
            catch (ex) {
                thrown = true;
                message = ex.message;
            }

            expect(thrown).to.be.true;
            expect(message).to.be.equal("The entered and stored passwords do not match.");
        });

        it('should authenticate and contain a context info that expires in the future.', function* () {

            let result = yield spRemoteAuth.authenticate(testSettings.valid.url, testSettings.valid.username, testSettings.valid.password);

            expect(result).to.not.equal(undefined);
            expect(moment(result.contextInfo.expires).isAfter(moment())).to.be.true;
        });
    });
});