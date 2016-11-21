## Installing gen-swagger-client-script
npm install --save gen-swagger-client-script

## Using Yarn
require('./scripts/gen-swagger-client-script.js')
    .genSwaggerClient
    .genJsScript('./api-spec/holla-api-spec.yaml', './scripts/');
