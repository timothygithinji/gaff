import * as pulumi from "@pulumi/pulumi";
/**
 * Accepted Permissions
 *
 * - `Access: Apps and Policies Read`
 * - `Access: Apps and Policies Revoke`
 * - `Access: Apps and Policies Write`
 * - `Access: Mutual TLS Certificates Write`
 * - `Access: Organizations, Identity Providers, and Groups Write`
 * - `Analytics Read`
 * - `Apps Write`
 * - `Cache Purge`
 * - `DNS Read`
 * - `DNS Write`
 * - `Firewall Services Read`
 * - `Firewall Services Write`
 * - `Load Balancers Read`
 * - `Load Balancers Write`
 * - `Logs Read`
 * - `Logs Write`
 * - `Page Rules Read`
 * - `Page Rules Write`
 * - `SSL and Certificates Read`
 * - `SSL and Certificates Write`
 * - `Stream Read`
 * - `Stream Write`
 * - `Trust and Safety Read`
 * - `Trust and Safety Write`
 * - `Workers Routes Read`
 * - `Workers Routes Write`
 * - `Workers Scripts Read`
 * - `Workers Scripts Write`
 * - `Zaraz Admin`
 * - `Zaraz Edit`
 * - `Zaraz Read`
 * - `Zero Trust: PII Read`
 * - `Zone Read`
 * - `Zone Settings Read`
 * - `Zone Settings Write`
 * - `Zone Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleZoneHold = cloudflare.getZoneHold({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getZoneHold(args?: GetZoneHoldArgs, opts?: pulumi.InvokeOptions): Promise<GetZoneHoldResult>;
/**
 * A collection of arguments for invoking getZoneHold.
 */
export interface GetZoneHoldArgs {
    /**
     * Identifier.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getZoneHold.
 */
export interface GetZoneHoldResult {
    readonly hold: boolean;
    readonly holdAfter: string;
    /**
     * Identifier.
     */
    readonly id: string;
    readonly includeSubdomains: string;
    /**
     * Identifier.
     */
    readonly zoneId?: string;
}
/**
 * Accepted Permissions
 *
 * - `Access: Apps and Policies Read`
 * - `Access: Apps and Policies Revoke`
 * - `Access: Apps and Policies Write`
 * - `Access: Mutual TLS Certificates Write`
 * - `Access: Organizations, Identity Providers, and Groups Write`
 * - `Analytics Read`
 * - `Apps Write`
 * - `Cache Purge`
 * - `DNS Read`
 * - `DNS Write`
 * - `Firewall Services Read`
 * - `Firewall Services Write`
 * - `Load Balancers Read`
 * - `Load Balancers Write`
 * - `Logs Read`
 * - `Logs Write`
 * - `Page Rules Read`
 * - `Page Rules Write`
 * - `SSL and Certificates Read`
 * - `SSL and Certificates Write`
 * - `Stream Read`
 * - `Stream Write`
 * - `Trust and Safety Read`
 * - `Trust and Safety Write`
 * - `Workers Routes Read`
 * - `Workers Routes Write`
 * - `Workers Scripts Read`
 * - `Workers Scripts Write`
 * - `Zaraz Admin`
 * - `Zaraz Edit`
 * - `Zaraz Read`
 * - `Zero Trust: PII Read`
 * - `Zone Read`
 * - `Zone Settings Read`
 * - `Zone Settings Write`
 * - `Zone Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleZoneHold = cloudflare.getZoneHold({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getZoneHoldOutput(args?: GetZoneHoldOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetZoneHoldResult>;
/**
 * A collection of arguments for invoking getZoneHold.
 */
export interface GetZoneHoldOutputArgs {
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getZoneHold.d.ts.map