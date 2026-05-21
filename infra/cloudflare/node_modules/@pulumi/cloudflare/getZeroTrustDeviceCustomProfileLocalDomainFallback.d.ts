import * as pulumi from "@pulumi/pulumi";
/**
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleZeroTrustDeviceCustomProfileLocalDomainFallback = cloudflare.getZeroTrustDeviceCustomProfileLocalDomainFallback({
 *     accountId: "699d98642c564d2e855e9661899b7252",
 *     policyId: "f174e90a-fafe-4643-bbbc-4a0ed4fc8415",
 * });
 * ```
 */
export declare function getZeroTrustDeviceCustomProfileLocalDomainFallback(args: GetZeroTrustDeviceCustomProfileLocalDomainFallbackArgs, opts?: pulumi.InvokeOptions): Promise<GetZeroTrustDeviceCustomProfileLocalDomainFallbackResult>;
/**
 * A collection of arguments for invoking getZeroTrustDeviceCustomProfileLocalDomainFallback.
 */
export interface GetZeroTrustDeviceCustomProfileLocalDomainFallbackArgs {
    accountId?: string;
    policyId: string;
}
/**
 * A collection of values returned by getZeroTrustDeviceCustomProfileLocalDomainFallback.
 */
export interface GetZeroTrustDeviceCustomProfileLocalDomainFallbackResult {
    readonly accountId?: string;
    /**
     * A description of the fallback domain, displayed in the client UI.
     */
    readonly description: string;
    /**
     * A list of IP addresses to handle domain resolution.
     */
    readonly dnsServers: string[];
    /**
     * The ID of this resource.
     */
    readonly id: string;
    readonly policyId: string;
    /**
     * The domain suffix to match when resolving locally.
     */
    readonly suffix: string;
}
/**
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleZeroTrustDeviceCustomProfileLocalDomainFallback = cloudflare.getZeroTrustDeviceCustomProfileLocalDomainFallback({
 *     accountId: "699d98642c564d2e855e9661899b7252",
 *     policyId: "f174e90a-fafe-4643-bbbc-4a0ed4fc8415",
 * });
 * ```
 */
export declare function getZeroTrustDeviceCustomProfileLocalDomainFallbackOutput(args: GetZeroTrustDeviceCustomProfileLocalDomainFallbackOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetZeroTrustDeviceCustomProfileLocalDomainFallbackResult>;
/**
 * A collection of arguments for invoking getZeroTrustDeviceCustomProfileLocalDomainFallback.
 */
export interface GetZeroTrustDeviceCustomProfileLocalDomainFallbackOutputArgs {
    accountId?: pulumi.Input<string | undefined>;
    policyId: pulumi.Input<string>;
}
//# sourceMappingURL=getZeroTrustDeviceCustomProfileLocalDomainFallback.d.ts.map