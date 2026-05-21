import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Zone Settings Read`
 * - `Zone Settings Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleEmailRoutingDns = cloudflare.getEmailRoutingDns({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     subdomain: "example.net",
 * });
 * ```
 */
export declare function getEmailRoutingDns(args?: GetEmailRoutingDnsArgs, opts?: pulumi.InvokeOptions): Promise<GetEmailRoutingDnsResult>;
/**
 * A collection of arguments for invoking getEmailRoutingDns.
 */
export interface GetEmailRoutingDnsArgs {
    /**
     * Domain of your zone.
     */
    subdomain?: string;
    /**
     * Identifier.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getEmailRoutingDns.
 */
export interface GetEmailRoutingDnsResult {
    readonly errors: outputs.GetEmailRoutingDnsError[];
    /**
     * Identifier.
     */
    readonly id: string;
    readonly messages: outputs.GetEmailRoutingDnsMessage[];
    readonly result: outputs.GetEmailRoutingDnsResult;
    readonly resultInfo: outputs.GetEmailRoutingDnsResultInfo;
    /**
     * Domain of your zone.
     */
    readonly subdomain?: string;
    /**
     * Whether the API call was successful.
     */
    readonly success: boolean;
    /**
     * Identifier.
     */
    readonly zoneId?: string;
}
/**
 * Accepted Permissions
 *
 * - `Zone Settings Read`
 * - `Zone Settings Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleEmailRoutingDns = cloudflare.getEmailRoutingDns({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     subdomain: "example.net",
 * });
 * ```
 */
export declare function getEmailRoutingDnsOutput(args?: GetEmailRoutingDnsOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetEmailRoutingDnsResult>;
/**
 * A collection of arguments for invoking getEmailRoutingDns.
 */
export interface GetEmailRoutingDnsOutputArgs {
    /**
     * Domain of your zone.
     */
    subdomain?: pulumi.Input<string | undefined>;
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getEmailRoutingDns.d.ts.map