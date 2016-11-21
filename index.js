// @flow

function defGenSwaggerClient(_) {
	function genFlowtypeKeys(definitions) {
		return Object.keys(definitions)
			.filter(k => definitions[k].type === 'object' || definitions[k].allOf)
			.map(k => {
				return {key: k, obj: definitions[k]};
			});
	}

	function getFlowType(schemeObject, customTypeMap) {
		const customType = Object.keys(customTypeMap)
			.find(k => _.isEqual(customTypeMap[k], schemeObject) || _.isEqual(customTypeMap[k], schemeObject.schema));

		const enumObj = schemeObject.schema?schemeObject.schema.enum:schemeObject.enum;

		if (enumObj) {
			return enumObj.map(e => typeof(e) === 'string'?'"' + e + '"':e).join('|');
		} else if (customType) {
			return customType;
		} else {
			let typeString = schemeObject.type || schemeObject.schema.type || 'Object';
			if (typeString === 'integer') {
				typeString = 'number';
			}
			if (typeString === 'object') {
				typeString = 'Object';
			}
			if (typeString === 'array') {
				typeString = '[' + getFlowType(schemeObject.items, customTypeMap) + ']';
			}
			return typeString;
		}

	}

	function createParameters(parameters, security, customTypeMap) {
		const pathParameters = parameters.filter(p => p.in === 'path');
		const queryParameters = parameters.filter(p => p.in === 'query');
		const bodyParameters = parameters.filter(p => p.in === 'body');

	//_.camelCase(bodyParameters[0].name)
		return pathParameters.map(p => {
				return `${_.camelCase(p.name)}/*:${getFlowType(p, customTypeMap)}*/`;
			})
			.concat(bodyParameters.length>0?[`${_.camelCase(getFlowType(bodyParameters[0], customTypeMap))}/*:${getFlowType(bodyParameters[0], customTypeMap)}*/`]:[])
			.concat(security?[_.camelCase(security.name) + '/*:string*/']:[])
			.concat(queryParameters.map(p => {
				return `${_.camelCase(p.name)}/*:${getFlowType(p, customTypeMap)}*/${'default' in p?" = " + p.default:''}`;
			}));
	}

	function capitalizeFirstLetter(string) {
	    return string.charAt(0).toUpperCase() + string.slice(1);
	}

	function createPathParameterCode(pathParameter) {
		return `.replace('{${pathParameter.name}}', ${_.camelCase(pathParameter.name)})`;
	}

	function createQueryParameterCode(queryParameters) {
		return `const queryParameters = {
					${queryParameters.map(q => q.name===_.camelCase(q.name)?q.name:("'" + q.name + '\': ' + _.camelCase(q.name))).join(', ')}
				};
				`;
	}

	/**
	 * ${JSON.stringify(methodData.obj, null, '\t')}
	 * methodData.obj.description
	 */
	function createMethod(methodData, customTypeMap) {
		const queryParameters = methodData.parameters.filter(p => p.in === 'query');

	/**
	 * Determines whether a node is a field.
	 * @return {boolean} True if the contents of
	 *     the element are editable, but the element
	 *     itself is not.
	 * @deprecated Use isField().
	 */
		return `
	    /**
	     * ${methodData.obj.description}
	     * @return {Promise<Object>} ${methodData.responseDescription}
	     */
		function ${methodData.methodName}(${createParameters(methodData.parameters, methodData.security, customTypeMap).join(', ')})/*:Promise<Object>*/ {
			const urlPath = '${methodData.urlPath}'${methodData.pathParameters.length>0?'':';'}
				${methodData.pathParameters.map(p => createPathParameterCode(p)).join('')}${methodData.pathParameters.length>0?';':''}
			${queryParameters.length>0?createQueryParameterCode(queryParameters):''}
			return getJson(urlPath${queryParameters.length>0?' + jsonToQueryString(queryParameters)':''}, '${methodData.httpMethod.toUpperCase()}', ${methodData.security?'{' + methodData.security.name + ': ' + _.camelCase(methodData.security.name) + '}':'{}'}${methodData.bodyParameters.length>0?`, ${_.camelCase(getFlowType(methodData.bodyParameters[0], customTypeMap))}`:''});
		}
	`;
	}


	function compressDefinition(objDefinitions) {
		let def = _.cloneDeep(objDefinitions);

		if (objDefinitions.allOf) {
			def.allOf.forEach(d => {
				def = _.merge({}, def, compressDefinition(d))
			});
		}
		return def;
	}

	function genFlowtypeObjects(definitions) {
		const customTypeMap = Object.keys(definitions)
			.filter(k => definitions[k].type === 'object' || definitions[k].allOf)
			.reduce((d, k) => {
				d[k] = definitions[k]
				return d;
			}, {});

		return Object.keys(definitions)
			.filter(k => definitions[k].type === 'object' || definitions[k].allOf)
			.filter(k => definitions[k].properties || definitions[k].allOf)
			.map(k => {
				let objDefinitions = compressDefinition(definitions[k]);

				const props = Object.keys(objDefinitions.properties)
					.map(propName => {
						const isRequired = objDefinitions.required && objDefinitions.required.includes(propName);
						return `${propName}${isRequired?'':'?'}: ${getFlowType(objDefinitions.properties[propName], customTypeMap)}`
					}).join(',\n	');

					return `
export type ${k} = {
	${props}
};`;
			});
	}

	function genFlowtypeKeys(definitions) {
		return Object.keys(definitions)
			.filter(k => definitions[k].type === 'object' || definitions[k].allOf);
	}


	function createFlowtypeJsFile(api/*:Object*/, basename/*:string*/) {
		return `
// @flow
/**
 * ${api.info.title}: ${api.info.description} flowtypes
 * AUTOGENERATED CODE FROM ${basename}
 * UPDATED ${(new Date()).toDateString()}
 */


${genFlowtypeObjects(api.definitions).join('\n')}
	`;

	}

	function createJsFile(api/*:Object*/, flowtypeFileName/*:string*/, basename/*:string*/) {
		const controllerNames = {};
		Object.keys(api.paths)
			.forEach(urlPath => {
				Object.keys(api.paths[urlPath])
					.filter(httpMethod => httpMethod !== 'x-swagger-router-controller')
					.filter(httpMethod => httpMethod !== 'x-expand-parameters')
					.filter(httpMethod => api.paths[urlPath]['x-swagger-router-controller'])
					.map(httpMethod => {
						const swaggerContoller = api.paths[urlPath]['x-swagger-router-controller'];
						controllerNames[swaggerContoller] = controllerNames[swaggerContoller] || 0;
						controllerNames[swaggerContoller] += 1;
					});
			});

		const methodData = _.flatten(Object.keys(api.paths)
			.map(urlPath => {

				return Object.keys(api.paths[urlPath])
					.filter(httpMethod => httpMethod !== 'x-swagger-router-controller')
					.filter(httpMethod => httpMethod !== 'x-expand-parameters')
					.map(httpMethod => {
						const swaggerContoller = api.paths[urlPath]['x-swagger-router-controller'];
						const numberOfHttpMethods = controllerNames[swaggerContoller];

						const security = 'security' in api.paths[urlPath][httpMethod]?
							api.securityDefinitions[Object.keys(api.paths[urlPath][httpMethod].security[0])[0]]:null;

						const parameters = api.paths[urlPath][httpMethod].parameters || [];
						const pathParameters = parameters.filter(p => p.in === 'path');
						const queryParameters = parameters.filter(p => p.in === 'query');
						const bodyParameters = parameters.filter(p => p.in === 'body');

						const methodName = _.camelCase(swaggerContoller) + (numberOfHttpMethods > 1?_.capitalize(httpMethod):'');

						const responses = api.paths[urlPath][httpMethod].responses;
						const responseDescription = responses[Object.keys(responses)[0]].description || responses[Object.keys(responses)[0]].schema.description;

						return {
							obj: api.paths[urlPath][httpMethod],
							parameters,
							security,
							pathParameters,
							queryParameters,
							bodyParameters,
							urlPath,
							httpMethod,
							methodName,
							swaggerContoller,
							responseDescription
						};
					}).filter(e => e.swaggerContoller);
			}));


		const customTypeMap = Object.keys(api.definitions)
			.filter(k => api.definitions[k].type === 'object' || api.definitions[k].allOf)
			.reduce((d, k) => {
				d[k] = api.definitions[k]
				return d;
			}, {});

		return `
// @flow
/**
 * ${api.info.title}: ${api.info.description}
 * AUTOGENERATED CODE FROM ${basename}
 * UPDATED ${(new Date()).toDateString()}
 */

 /*::
	export type RequestData = {
		method: string,
		headers: { [key: string]: string },
		body?: string
	};
	import type {${_.chunk(genFlowtypeKeys(api.definitions), 5).map(e => e.join(', ')).join('\n                 ')}} from "${flowtypeFileName}";
*/
function clientApiDef(fetch, _) {

	function jsonToQueryString(json/*:{[key: string]:(string|number)}*/)/*:string*/ {
	    return '?' + 
	        Object.keys(json).map(function(key) {
	            return encodeURIComponent(key) + '=' +
	                encodeURIComponent(json[key].toString());
	        }).join('&');
	}

    function checkStatus(response/*:Object*/)/*:Promise<Object>*/ {
        if (response.status >= 200 && response.status < 300) {
            return response
        } else {
            throw Error(response.statusText + ' code ' + response.status + ' ' + JSON.stringify(response));
        }
    }

    return function (isCors/*:boolean*/=false, serverHost/*:string*/='https://${api.host}') {
		const basePath = serverHost + '${api.basePath}';

	    function getJson(url/*:string*/, method/*:string*/, headers/*:{[key: string]:string}*/={},
	    							body/*:?{[key: string]:any}*/=null)/*:Promise<Object>*/ {
	    	const requestData/*:RequestData*/ = Object.assign({},
		    	{
	                method,
	                headers: Object.assign(
	                	headers,
	                	{'Content-Type': '${api.consumes}'}
	                )
	            },
	            (isCors?{mode: 'cors'}:{}),
	            (body?{body: JSON.stringify(body)}:{})
            );

	        return fetch(basePath + url, requestData)
	            .then(checkStatus)
	            .then(r => r.json())
	            .catch(error => {
	            	throw Error(JSON.stringify({error, url, method, headers, body}));
	            });
	    }

	    ${methodData.map(m => createMethod(m, customTypeMap)).join('\n')}

	    return {
	    	${methodData.map(m => m.methodName).join(', ')}
	    };
	}
}

if (typeof exports !== 'undefined') {
    exports.${capitalizeFirstLetter(_.camelCase(api.info.title))} = module.exports.client = clientApiDef(require('node-fetch'), require('lodash'), require('moment'));
} else {
    window.${capitalizeFirstLetter(_.camelCase(api.info.title))} = clientApiDef(window.fetch, window._, window.moment);
}
	`;
	}

	function genJsScript(apiPath/*:string*/, directory/*:string*/) {
		const _ = require('lodash');
		const path = require('path');
		const SwaggerParser = require('swagger-parser');
		const fs = require('fs');

	    SwaggerParser.validate(apiPath, function(err, api) {
	        if (err) {
	            console.error(err);
	        } else {
	        	const output = directory + _.kebabCase(api.info.title) + '-client'
				const flowtypeFileName = output + '-flowtypes.js';

				const jsFlowTypeCode = createFlowtypeJsFile(_.cloneDeep(api), path.basename(__filename));
				fs.writeFile(flowtypeFileName, jsFlowTypeCode, function(err) {
				    if(err) {
				        return console.log(err);
				    }

				    console.log("The file was saved!");
				}); 

				const jsCode = createJsFile(_.cloneDeep(api), './' + path.basename(output) + '-flowtypes.js', path.basename(__filename));
				fs.writeFile(output + '.js', jsCode, function(err) {
				    if(err) {
				        return console.log(err);
				    }

				    console.log("The file was saved!");
				}); 
	        }
	    });
	}

	return {genJsScript, createFlowtypeJsFile, createJsFile};
}

if (typeof exports !== 'undefined') {
    exports.genSwaggerClient = module.exports.genSwaggerClient = defGenSwaggerClient(require('lodash'));
} else {
    window.genSwaggerClient = defGenSwaggerClient(window._);
}
