## gen-swagger-client-script
Generates a Javascript Client with Flowtyping from Swagger specs

The generated client API returns promises

## Installing gen-swagger-client-script
```js
npm install --save gen-swagger-client-script
```

## Using Yarn
```js
require('./scripts/gen-swagger-client-script.js')
    .genSwaggerClient
    .genJsScript('./api-spec/holla-api-spec.yaml', './scripts/');
```

genJsScript(yaml swagger spec, directory to put the client api)



