/**
 * The API key for operations. Alternatively, can be configured using the `CLOUDFLARE_API_KEY` environment variable. API keys are [now considered legacy by Cloudflare](https://developers.cloudflare.com/fundamentals/api/get-started/keys/#limitations), API tokens should be used instead. Must provide only one of `apiKey`, `apiToken`, `apiUserServiceKey`.
 */
export declare const apiKey: string | undefined;
/**
 * The API Token for operations. Alternatively, can be configured using the `CLOUDFLARE_API_TOKEN` environment variable. Must provide only one of `apiKey`, `apiToken`, `apiUserServiceKey`.
 */
export declare const apiToken: string | undefined;
/**
 * A special Cloudflare API key good for a restricted set of endpoints. Alternatively, can be configured using the `CLOUDFLARE_API_USER_SERVICE_KEY` environment variable. Must provide only one of `apiKey`, `apiToken`, `apiUserServiceKey`.
 */
export declare const apiUserServiceKey: string | undefined;
/**
 * Value to override the default HTTP client base URL. Alternatively, can be configured using the `baseUrl` environment variable.
 */
export declare const baseUrl: string | undefined;
/**
 * A registered Cloudflare email address. Alternatively, can be configured using the `CLOUDFLARE_EMAIL` environment variable. Required when using `apiKey`. Conflicts with `apiToken`.
 */
export declare const email: string | undefined;
/**
 * A value to append to the HTTP User Agent for all API calls. This value is not something most users need to modify however, if you are using a non-standard provider or operator configuration, this is recommended to assist in uniquely identifying your traffic. **Setting this value will remove the Terraform version from the HTTP User Agent string and may have unintended consequences**. Alternatively, can be configured using the `CLOUDFLARE_USER_AGENT_OPERATOR_SUFFIX` environment variable.
 */
export declare const userAgentOperatorSuffix: string | undefined;
//# sourceMappingURL=vars.d.ts.map