import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Magic Transit Read`
 * - `Magic Transit Write`
 * - `Magic WAN Read`
 * - `Magic WAN Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleMagicWanGreTunnel = cloudflare.getMagicWanGreTunnel({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     greTunnelId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getMagicWanGreTunnel(args: GetMagicWanGreTunnelArgs, opts?: pulumi.InvokeOptions): Promise<GetMagicWanGreTunnelResult>;
/**
 * A collection of arguments for invoking getMagicWanGreTunnel.
 */
export interface GetMagicWanGreTunnelArgs {
    /**
     * Identifier
     */
    accountId?: string;
    /**
     * Identifier
     */
    greTunnelId: string;
}
/**
 * A collection of values returned by getMagicWanGreTunnel.
 */
export interface GetMagicWanGreTunnelResult {
    /**
     * Identifier
     */
    readonly accountId?: string;
    readonly greTunnel: outputs.GetMagicWanGreTunnelGreTunnel;
    /**
     * Identifier
     */
    readonly greTunnelId: string;
    /**
     * Identifier
     */
    readonly id: string;
}
/**
 * Accepted Permissions
 *
 * - `Magic Transit Read`
 * - `Magic Transit Write`
 * - `Magic WAN Read`
 * - `Magic WAN Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleMagicWanGreTunnel = cloudflare.getMagicWanGreTunnel({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     greTunnelId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getMagicWanGreTunnelOutput(args: GetMagicWanGreTunnelOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetMagicWanGreTunnelResult>;
/**
 * A collection of arguments for invoking getMagicWanGreTunnel.
 */
export interface GetMagicWanGreTunnelOutputArgs {
    /**
     * Identifier
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * Identifier
     */
    greTunnelId: pulumi.Input<string>;
}
//# sourceMappingURL=getMagicWanGreTunnel.d.ts.map