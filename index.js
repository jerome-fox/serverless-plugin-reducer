"use strict";

const globby                       = require("globby")
    , multimatch                   = require("multimatch")
    , BbPromise                    = require("bluebird")
    , resolveLambdaModulePaths     = require("./lib/private/resolve-lambda-module-paths")
    , ServerlessPluginReducerError = require("./lib/private/serverless-plugin-reducer-error");

module.exports = class ServerlessPluginReducer {
	constructor(serverless) {
		const packagePlugin = serverless.pluginManager.plugins.find(
			plugin => plugin.constructor.name === "Package"
		);

		packagePlugin.resolveFilePathsFunction = function (functionName) {
			const functionObject = this.serverless.service.getFunction(functionName);
			const funcPackageConfig = functionObject.package || {};
			const { servicePath } = serverless.config;

			if (!functionObject.handler) {
				return BbPromise.reject(
					new ServerlessPluginReducerError(
						`Function ${ JSON.stringify(functionName) } misses 'handler' configuration`,
						"INVALID_LAMBDA_CONFIGURATION"
					)
				);
			}

			return BbPromise.all([
				// Get all lambda dependencies resolved by walking require paths
				resolveLambdaModulePaths(servicePath, functionObject),
				// Get all files mentioned specifically in 'include' option
				globby(this.getIncludes(funcPackageConfig.include), {
					cwd: this.serverless.config.servicePath,
					dot: true,
					silent: true,
					follow: true,
					nodir: true
				})
			]).then(([modulePaths, includeModulePaths]) =>
				// Apply eventual 'exclude' rules to automatically resolved dependencies
				multimatch(
					modulePaths,
					["**"].concat(
						this.getExcludes(funcPackageConfig.include).map(
							pattern =>
								pattern.charAt(0) === "!" ? pattern.slice(1) : `!${ pattern }`
						)
					)
				).concat(includeModulePaths)
			);
		};
	}
};
