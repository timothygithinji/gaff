import * as pulumi from "@pulumi/pulumi";
/**
 * Accepted Permissions
 *
 * - `Zero Trust Read`
 * - `Zero Trust Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleZeroTrustGatewayPacfile = cloudflare.getZeroTrustGatewayPacfile({
 *     accountId: "699d98642c564d2e855e9661899b7252",
 *     pacfileId: "ed35569b41ce4d1facfe683550f54086",
 * });
 * ```
 */
export declare function getZeroTrustGatewayPacfile(args: GetZeroTrustGatewayPacfileArgs, opts?: pulumi.InvokeOptions): Promise<GetZeroTrustGatewayPacfileResult>;
/**
 * A collection of arguments for invoking getZeroTrustGatewayPacfile.
 */
export interface GetZeroTrustGatewayPacfileArgs {
    accountId?: string;
    pacfileId: string;
}
/**
 * A collection of values returned by getZeroTrustGatewayPacfile.
 */
export interface GetZeroTrustGatewayPacfileResult {
    readonly accountId?: string;
    /**
     * Actual contents of the PAC file
     */
    readonly contents: string;
    readonly createdAt: string;
    /**
     * Detailed description of the PAC file.
     */
    readonly description: string;
    /**
     * The ID of this resource.
     */
    readonly id: string;
    /**
     * Name of the PAC file.
     */
    readonly name: string;
    readonly pacfileId: string;
    /**
     * URL-friendly version of the PAC file name.
     */
    readonly slug: string;
    readonly updatedAt: string;
    /**
     * Unique URL to download the PAC file.
     */
    readonly url: string;
}
/**
 * Accepted Permissions
 *
 * - `Zero Trust Read`
 * - `Zero Trust Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleZeroTrustGatewayPacfile = cloudflare.getZeroTrustGatewayPacfile({
 *     accountId: "699d98642c564d2e855e9661899b7252",
 *     pacfileId: "ed35569b41ce4d1facfe683550f54086",
 * });
 * ```
 */
export declare function getZeroTrustGatewayPacfileOutput(args: GetZeroTrustGatewayPacfileOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetZeroTrustGatewayPacfileResult>;
/**
 * A collection of arguments for invoking getZeroTrustGatewayPacfile.
 */
export interface GetZeroTrustGatewayPacfileOutputArgs {
    accountId?: pulumi.Input<string | undefined>;
    pacfileId: pulumi.Input<string>;
}
//# sourceMappingURL=getZeroTrustGatewayPacfile.d.ts.map