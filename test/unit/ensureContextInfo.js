"use strict";

require('mocha-generators').install();
const moment = require("moment");

describe('spo-remote-auth', function () {
    describe('ensureContextInfo', function () {

        beforeEach(function () {
            //If we're not live, setup the nock from the pre-recorded fixture.
            if (!isLive) {
                let nockDefs = postProcessNockFixture("nock-ensureContextInfo.json");
                //  Load the nocks from pre-processed definitions.
                let nocks = nock.define(nockDefs);
            }
        });

        it('should not re-request the contextInfo if not expired', function* () {
               let ctx = yield spRemoteAuth.authenticate(testSettings.valid.url, testSettings.valid.username, testSettings.valid.password);

               let contextInfo = yield ctx.ensureContextInfo();
               expect(ctx.contextInfo).to.be.equal(contextInfo);
        });

        it('should re-request the contextInfo if expired', function* () {
               let ctx = yield spRemoteAuth.authenticate(testSettings.valid.url, testSettings.valid.username, testSettings.valid.password);

               ctx.contextInfo.expires = moment().subtract(5, "days").toDate();

               let contextInfo = yield ctx.ensureContextInfo();
               expect(ctx.contextInfo).to.be.not.equal(contextInfo);
               expect(moment(contextInfo.expires).isAfter(moment())).to.be.true;
        });
    });
});