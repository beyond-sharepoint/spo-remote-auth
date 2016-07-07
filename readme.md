beyond-sharepoint
---



Unit Testing
---
By default, the beyond-sharepoint unit tests use mock service responses.

To unit test against the actual SharePoint online services, use the --live option with mocha.

ex:

``` bash
$ mocha --live

    ✓ should contain an authenticate method
    ✓ should fail with invalid user
    ✓ should fail with invalid password
    ✓ should authenticate and contain a context info that expires in the future.
```

beyond-sharepoint uses credentials and urls for testing in test/fixtures/settings-test.json.

To supply real credentials, either modify this file in your dev environment, or use the --settings
option to specify the name of the settings file in the fixtures folder.

ex:

``` bash
$ mocha --settings settings-prod.json
```