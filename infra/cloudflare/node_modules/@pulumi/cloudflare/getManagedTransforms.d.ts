import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Account Rulesets Read`
 * - `Account Rulesets Write`
 * - `Account WAF Read`
 * - `Account WAF Write`
 * - `Bot Management Read`
 * - `Bot Management Write`
 * - `Cache Settings Read`
 * - `Cache Settings Write`
 * - `Config Settings Read`
 * - `Config Settings Write`
 * - `Custom Errors Read`
 * - `Custom Errors Write`
 * - `Dynamic URL Redirects Read`
 * - `Dynamic URL Redirects Write`
 * - `HTTP DDoS Managed Ruleset Read`
 * - `HTTP DDoS Managed Ruleset Write`
 * - `L4 DDoS Managed Ruleset Read`
 * - `L4 DDoS Managed Ruleset Write`
 * - `Logs Read`
 * - `Logs Write`
 * - `Magic Firewall Read`
 * - `Magic Firewall Write`
 * - `Managed headers Read`
 * - `Managed headers Write`
 * - `Mass URL Redirects Read`
 * - `Mass URL Redirects Write`
 * - `Origin Read`
 * - `Origin Write`
 * - `Response Compression Read`
 * - `Response Compression Write`
 * - `Sanitize Read`
 * - `Sanitize Write`
 * - `Select Configuration Read`
 * - `Select Configuration Write`
 * - `Transform Rules Read`
 * - `Transform Rules Write`
 * - `Zone Transform Rules Read`
 * - `Zone Transform Rules Write`
 * - `Zone WAF Read`
 * - `Zone WAF Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleManagedTransforms = cloudflare.getManagedTransforms({
 *     zoneId: "9f1839b6152d298aca64c4e906b6d074",
 * });
 * ```
 */
export declare function getManagedTransforms(args?: GetManagedTransformsArgs, opts?: pulumi.InvokeOptions): Promise<GetManagedTransformsResult>;
/**
 * A collection of arguments for invoking getManagedTransforms.
 */
export interface GetManagedTransformsArgs {
    /**
     * The unique ID of the zone.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getManagedTransforms.
 */
export interface GetManagedTransformsResult {
    /**
     * The unique ID of the zone.
     */
    readonly id: string;
    /**
     * The list of Managed Request Transforms.
     */
    readonly managedRequestHeaders: outputs.GetManagedTransformsManagedRequestHeader[];
    /**
     * The list of Managed Response Transforms.
     */
    readonly managedResponseHeaders: outputs.GetManagedTransformsManagedResponseHeader[];
    /**
     * The unique ID of the zone.
     */
    readonly zoneId?: string;
}
/**
 * Accepted Permissions
 *
 * - `Account Rulesets Read`
 * - `Account Rulesets Write`
 * - `Account WAF Read`
 * - `Account WAF Write`
 * - `Bot Management Read`
 * - `Bot Management Write`
 * - `Cache Settings Read`
 * - `Cache Settings Write`
 * - `Config Settings Read`
 * - `Config Settings Write`
 * - `Custom Errors Read`
 * - `Custom Errors Write`
 * - `Dynamic URL Redirects Read`
 * - `Dynamic URL Redirects Write`
 * - `HTTP DDoS Managed Ruleset Read`
 * - `HTTP DDoS Managed Ruleset Write`
 * - `L4 DDoS Managed Ruleset Read`
 * - `L4 DDoS Managed Ruleset Write`
 * - `Logs Read`
 * - `Logs Write`
 * - `Magic Firewall Read`
 * - `Magic Firewall Write`
 * - `Managed headers Read`
 * - `Managed headers Write`
 * - `Mass URL Redirects Read`
 * - `Mass URL Redirects Write`
 * - `Origin Read`
 * - `Origin Write`
 * - `Response Compression Read`
 * - `Response Compression Write`
 * - `Sanitize Read`
 * - `Sanitize Write`
 * - `Select Configuration Read`
 * - `Select Configuration Write`
 * - `Transform Rules Read`
 * - `Transform Rules Write`
 * - `Zone Transform Rules Read`
 * - `Zone Transform Rules Write`
 * - `Zone WAF Read`
 * - `Zone WAF Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleManagedTransforms = cloudflare.getManagedTransforms({
 *     zoneId: "9f1839b6152d298aca64c4e906b6d074",
 * });
 * ```
 */
export declare function getManagedTransformsOutput(args?: GetManagedTransformsOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetManagedTransformsResult>;
/**
 * A collection of arguments for invoking getManagedTransforms.
 */
export interface GetManagedTransformsOutputArgs {
    /**
     * The unique ID of the zone.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getManagedTransforms.d.ts.map