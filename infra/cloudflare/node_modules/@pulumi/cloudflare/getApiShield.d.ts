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
 * const exampleApiShield = cloudflare.getApiShield({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     normalize: true,
 * });
 * ```
 */
export declare function getApiShield(args?: GetApiShieldArgs, opts?: pulumi.InvokeOptions): Promise<GetApiShieldResult>;
/**
 * A collection of arguments for invoking getApiShield.
 */
export interface GetApiShieldArgs {
    /**
     * Ensures that the configuration is written or retrieved in normalized fashion
     */
    normalize?: boolean;
    /**
     * Identifier.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getApiShield.
 */
export interface GetApiShieldResult {
    readonly authIdCharacteristics: outputs.GetApiShieldAuthIdCharacteristic[];
    /**
     * Identifier.
     */
    readonly id: string;
    /**
     * Ensures that the configuration is written or retrieved in normalized fashion
     */
    readonly normalize?: boolean;
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
 * const exampleApiShield = cloudflare.getApiShield({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     normalize: true,
 * });
 * ```
 */
export declare function getApiShieldOutput(args?: GetApiShieldOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetApiShieldResult>;
/**
 * A collection of arguments for invoking getApiShield.
 */
export interface GetApiShieldOutputArgs {
    /**
     * Ensures that the configuration is written or retrieved in normalized fashion
     */
    normalize?: pulumi.Input<boolean | undefined>;
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getApiShield.d.ts.map