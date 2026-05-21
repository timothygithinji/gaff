import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Cloud Connector Read`
 * - `Cloud Connector Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleCloudConnectorRules = cloudflare.getCloudConnectorRules({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getCloudConnectorRules(args?: GetCloudConnectorRulesArgs, opts?: pulumi.InvokeOptions): Promise<GetCloudConnectorRulesResult>;
/**
 * A collection of arguments for invoking getCloudConnectorRules.
 */
export interface GetCloudConnectorRulesArgs {
    /**
     * Identifier.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getCloudConnectorRules.
 */
export interface GetCloudConnectorRulesResult {
    /**
     * Identifier.
     */
    readonly id: string;
    readonly rules: outputs.GetCloudConnectorRulesRule[];
    /**
     * Identifier.
     */
    readonly zoneId?: string;
}
/**
 * Accepted Permissions
 *
 * - `Cloud Connector Read`
 * - `Cloud Connector Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleCloudConnectorRules = cloudflare.getCloudConnectorRules({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getCloudConnectorRulesOutput(args?: GetCloudConnectorRulesOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetCloudConnectorRulesResult>;
/**
 * A collection of arguments for invoking getCloudConnectorRules.
 */
export interface GetCloudConnectorRulesOutputArgs {
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getCloudConnectorRules.d.ts.map