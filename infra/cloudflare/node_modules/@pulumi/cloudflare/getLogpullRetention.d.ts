import * as pulumi from "@pulumi/pulumi";
/**
 * Accepted Permissions
 *
 * - `Logs Read`
 * - `Logs Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleLogpullRetention = cloudflare.getLogpullRetention({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getLogpullRetention(args?: GetLogpullRetentionArgs, opts?: pulumi.InvokeOptions): Promise<GetLogpullRetentionResult>;
/**
 * A collection of arguments for invoking getLogpullRetention.
 */
export interface GetLogpullRetentionArgs {
    /**
     * Identifier.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getLogpullRetention.
 */
export interface GetLogpullRetentionResult {
    /**
     * The log retention flag for Logpull API.
     */
    readonly flag: boolean;
    /**
     * Identifier.
     */
    readonly id: string;
    /**
     * Identifier.
     */
    readonly zoneId?: string;
}
/**
 * Accepted Permissions
 *
 * - `Logs Read`
 * - `Logs Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleLogpullRetention = cloudflare.getLogpullRetention({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getLogpullRetentionOutput(args?: GetLogpullRetentionOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetLogpullRetentionResult>;
/**
 * A collection of arguments for invoking getLogpullRetention.
 */
export interface GetLogpullRetentionOutputArgs {
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getLogpullRetention.d.ts.map