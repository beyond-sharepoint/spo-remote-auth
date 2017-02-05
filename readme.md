[![CircleCI](https://circleci.com/gh/beyond-sharepoint/spo-remote-auth.svg?style=svg)](https://circleci.com/gh/beyond-sharepoint/spo-remote-auth)
![license](https://img.shields.io/github/license/mashape/apistatus.svg?maxAge=2592000)
![David](https://david-dm.org/beyond-sharepoint/ntlm-remote-auth.svg)

@beyond-sharepoint/spo-remote-auth
---
Provides a generic remote authentication implementation against SharePoint online.

To use, simply import the module and supply the tenant url and credentials.

``` js
const spo = require("@beyond-sharepoint/spo-remote-auth");

spo.authenticate("https://mytenantname.sharepoint.com", "myusername@mytenantname.onmicrosoft.com", "mypassword")
    .then(function(ctx) {
        console.log("Success!!");
    }, function() {
        console.log("something went wrong.");
    });
```

The object that is returned when authentication succeeds contains the following properties:

#### contextInfo

Object that contains the context info returned by <tenantname>.sharepoint.com/_api/contextinfo

#### ensureContextInfo

Helper function that renews the context info if it has expired.

#### request

A request function similar to [request](http://github.com/request/request) that can be used to make authenticated calls with SPO.

Use this to make further authenticated calls with SharePoint online.

For instance, to upload a file to a document library:

``` js
const spo = require("@beyond-sharepoint/spo-remote-auth");
const URI = require("urijs");

spo.authenticate("https://mytenantname.sharepoint.com", "myusername@mytenantname.onmicrosoft.com", "mypassword")
    .then(function(ctx) {
        //upload a file to 'documents' library.

        let docLibUrl = "documents";
        let fileName = "test1234.txt";

        ctx.request({
            method: "POST",
            url: URI.joinPaths("/_api/web/", `GetFolderByServerRelativeUrl('${URI.encode(docLibUrl)}')/`, "files/", `add(url='${URI.encode(fileName)}',overwrite=true)`).href(),
            body: "Hello, world!"
        });
    });
```

The request function returns a promise that automatically renews ContextInfo if needed and makes the request to SharePoint.

Other packages on [Beyond SharePoint](https://github.com/beyond-sharepoint) provide concerted functionality.

Unit Testing
---
spo-remote-auth uses mocha/chai based unit tests to ensure quality.

By default, the unit tests use mock service responses via [nock](https://github.com/node-nock/nock).

just run ```npm test``` at the cli to run the tests:

``` bash
$ npm test

    ✓ should contain an authenticate method
    ✓ should fail with invalid user
    ✓ should fail with invalid password
    ✓ should authenticate and contain a context info that expires in the future.
```

## Unit Test Options

### --live
To test against the actual SharePoint online services instead of the mocks, use the --live option.

ex:

``` bash
$ npm test -- --live

    ✓ should contain an authenticate method
    ✓ should fail with invalid user
    ✓ should fail with invalid password
    ✓ should authenticate and contain a context info that expires in the future.
```

### --settings

You'll quickly find that you'll need to supply your own credentials and tenant name in order to test live,
to do so, you can modify the values in /test/fixtures/settings-test.json.

However, a better way is to use the --settings option to specify the name of a settings file that you provide.
Note that this file is relative to the /test/fixtures folder.

``` bash
$ npm test -- --settings settings-prod.json --live
```

settings-prod.json is included in .gitignore by default.

### --record

To aid in debugging, the --record option records all interaction with SPO and places it in /test/tmp/nock-test.json. 
It is expected that the live option is specified.

``` bash
$ npm test --  --record --live
```

### --recordOutput

To override the default record file name, use --recordOutput

``` bash
$ npm test --  --record --live --recordOutput nock-ensureContext.json
```
