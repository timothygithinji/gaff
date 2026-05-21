import * as pulumi from "@pulumi/pulumi";
/**
 * Accepted Permissions
 *
 * - `Account Custom Pages Read`
 * - `Account Custom Pages Write`
 * - `Account Settings Read`
 * - `Account Settings Write`
 * - `Zero Trust: PII Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleCustomPages = cloudflare.getCustomPages({
 *     identifier: "ratelimit_block",
 *     accountId: "account_id",
 *     zoneId: "zone_id",
 * });
 * ```
 */
export declare function getCustomPages(args: GetCustomPagesArgs, opts?: pulumi.InvokeOptions): Promise<GetCustomPagesResult>;
/**
 * A collection of arguments for invoking getCustomPages.
 */
export interface GetCustomPagesArgs {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    accountId?: string;
    /**
     * Error Page Types
     * Available values: "1000*errors", "500*errors", "basic*challenge", "country*challenge", "ip*block", "managed*challenge", "ratelimit*block", "under*attack", "waf*block", "waf*challenge".
     */
    identifier: string;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getCustomPages.
 */
export interface GetCustomPagesResult {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    readonly accountId?: string;
    readonly createdOn: string;
    readonly description: string;
    /**
     * Error Page Types
     * Available values: "1000*errors", "500*errors", "basic*challenge", "country*challenge", "ip*block", "managed*challenge", "ratelimit*block", "under*attack", "waf*block", "waf*challenge".
     */
    readonly id: string;
    /**
     * Error Page Types
     * Available values: "1000*errors", "500*errors", "basic*challenge", "country*challenge", "ip*block", "managed*challenge", "ratelimit*block", "under*attack", "waf*block", "waf*challenge".
     */
    readonly identifier: string;
    readonly modifiedOn: string;
    readonly previewTarget: string;
    readonly requiredTokens: string[];
    /**
     * The custom page state.
     * Available values: "default", "customized".
     */
    readonly state: string;
    /**
     * The URL associated with the custom page.
     */
    readonly url: string;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    readonly zoneId?: string;
}
/**
 * Accepted Permissions
 *
 * - `Account Custom Pages Read`
 * - `Account Custom Pages Write`
 * - `Account Settings Read`
 * - `Account Settings Write`
 * - `Zero Trust: PII Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleCustomPages = cloudflare.getCustomPages({
 *     identifier: "ratelimit_block",
 *     accountId: "account_id",
 *     zoneId: "zone_id",
 * });
 * ```
 */
export declare function getCustomPagesOutput(args: GetCustomPagesOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetCustomPagesResult>;
/**
 * A collection of arguments for invoking getCustomPages.
 */
export interface GetCustomPagesOutputArgs {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * Error Page Types
     * Available values: "1000*errors", "500*errors", "basic*challenge", "country*challenge", "ip*block", "managed*challenge", "ratelimit*block", "under*attack", "waf*block", "waf*challenge".
     */
    identifier: pulumi.Input<string>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getCustomPages.d.ts.map