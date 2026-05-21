import * as pulumi from "@pulumi/pulumi";
/**
 * Accepted Permissions
 *
 * - `Account WAF Read`
 * - `Account WAF Write`
 * - `Zone WAF Read`
 * - `Zone WAF Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleLeakedCredentialCheckRule = cloudflare.getLeakedCredentialCheckRule({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     detectionId: "18a14bafaa8eb1df04ce683ec18c765e",
 * });
 * ```
 */
export declare function getLeakedCredentialCheckRule(args: GetLeakedCredentialCheckRuleArgs, opts?: pulumi.InvokeOptions): Promise<GetLeakedCredentialCheckRuleResult>;
/**
 * A collection of arguments for invoking getLeakedCredentialCheckRule.
 */
export interface GetLeakedCredentialCheckRuleArgs {
    /**
     * Defines the unique ID for this custom detection.
     */
    detectionId: string;
    /**
     * Defines an identifier.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getLeakedCredentialCheckRule.
 */
export interface GetLeakedCredentialCheckRuleResult {
    /**
     * Defines the unique ID for this custom detection.
     */
    readonly detectionId: string;
    /**
     * Defines the unique ID for this custom detection.
     */
    readonly id: string;
    /**
     * Defines ehe ruleset expression to use in matching the password in a request.
     */
    readonly password: string;
    /**
     * Defines the ruleset expression to use in matching the username in a request.
     */
    readonly username: string;
    /**
     * Defines an identifier.
     */
    readonly zoneId?: string;
}
/**
 * Accepted Permissions
 *
 * - `Account WAF Read`
 * - `Account WAF Write`
 * - `Zone WAF Read`
 * - `Zone WAF Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleLeakedCredentialCheckRule = cloudflare.getLeakedCredentialCheckRule({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     detectionId: "18a14bafaa8eb1df04ce683ec18c765e",
 * });
 * ```
 */
export declare function getLeakedCredentialCheckRuleOutput(args: GetLeakedCredentialCheckRuleOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetLeakedCredentialCheckRuleResult>;
/**
 * A collection of arguments for invoking getLeakedCredentialCheckRule.
 */
export interface GetLeakedCredentialCheckRuleOutputArgs {
    /**
     * Defines the unique ID for this custom detection.
     */
    detectionId: pulumi.Input<string>;
    /**
     * Defines an identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getLeakedCredentialCheckRule.d.ts.map