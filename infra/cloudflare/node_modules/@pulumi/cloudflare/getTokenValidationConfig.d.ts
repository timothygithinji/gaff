import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Account API Gateway`
 * - `Account API Gateway Read`
 * - `Domain API Gateway`
 * - `Domain API Gateway Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleTokenValidationConfig = cloudflare.getTokenValidationConfig({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     configId: "4a7ee8d3-dd63-4ceb-9d5f-c27831854ce7",
 * });
 * ```
 */
export declare function getTokenValidationConfig(args: GetTokenValidationConfigArgs, opts?: pulumi.InvokeOptions): Promise<GetTokenValidationConfigResult>;
/**
 * A collection of arguments for invoking getTokenValidationConfig.
 */
export interface GetTokenValidationConfigArgs {
    /**
     * UUID.
     */
    configId: string;
    /**
     * Identifier.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getTokenValidationConfig.
 */
export interface GetTokenValidationConfigResult {
    /**
     * UUID.
     */
    readonly configId: string;
    readonly createdAt: string;
    readonly credentials: outputs.GetTokenValidationConfigCredentials;
    readonly description: string;
    /**
     * UUID.
     */
    readonly id: string;
    readonly lastUpdated: string;
    readonly title: string;
    readonly tokenSources: string[];
    /**
     * Available values: "JWT".
     */
    readonly tokenType: string;
    /**
     * Identifier.
     */
    readonly zoneId?: string;
}
/**
 * Accepted Permissions
 *
 * - `Account API Gateway`
 * - `Account API Gateway Read`
 * - `Domain API Gateway`
 * - `Domain API Gateway Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleTokenValidationConfig = cloudflare.getTokenValidationConfig({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     configId: "4a7ee8d3-dd63-4ceb-9d5f-c27831854ce7",
 * });
 * ```
 */
export declare function getTokenValidationConfigOutput(args: GetTokenValidationConfigOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetTokenValidationConfigResult>;
/**
 * A collection of arguments for invoking getTokenValidationConfig.
 */
export interface GetTokenValidationConfigOutputArgs {
    /**
     * UUID.
     */
    configId: pulumi.Input<string>;
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getTokenValidationConfig.d.ts.map