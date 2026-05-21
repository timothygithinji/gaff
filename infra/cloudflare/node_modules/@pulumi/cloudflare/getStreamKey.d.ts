import * as pulumi from "@pulumi/pulumi";
/**
 * Accepted Permissions
 *
 * - `Stream Read`
 * - `Stream Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleStreamKey = cloudflare.getStreamKey({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getStreamKey(args?: GetStreamKeyArgs, opts?: pulumi.InvokeOptions): Promise<GetStreamKeyResult>;
/**
 * A collection of arguments for invoking getStreamKey.
 */
export interface GetStreamKeyArgs {
    /**
     * Identifier.
     */
    accountId?: string;
}
/**
 * A collection of values returned by getStreamKey.
 */
export interface GetStreamKeyResult {
    /**
     * Identifier.
     */
    readonly accountId?: string;
    /**
     * The date and time a signing key was created.
     */
    readonly created: string;
    /**
     * Identifier.
     */
    readonly id: string;
    /**
     * The unique identifier for the signing key.
     */
    readonly keyId: string;
}
/**
 * Accepted Permissions
 *
 * - `Stream Read`
 * - `Stream Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleStreamKey = cloudflare.getStreamKey({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getStreamKeyOutput(args?: GetStreamKeyOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetStreamKeyResult>;
/**
 * A collection of arguments for invoking getStreamKey.
 */
export interface GetStreamKeyOutputArgs {
    /**
     * Identifier.
     */
    accountId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getStreamKey.d.ts.map