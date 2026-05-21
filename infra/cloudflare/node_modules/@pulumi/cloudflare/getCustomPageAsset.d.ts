import * as pulumi from "@pulumi/pulumi";
/**
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleCustomPageAsset = cloudflare.getCustomPageAsset({
 *     assetName: "my_custom_error_page",
 *     accountId: "account_id",
 *     zoneId: "zone_id",
 * });
 * ```
 */
export declare function getCustomPageAsset(args: GetCustomPageAssetArgs, opts?: pulumi.InvokeOptions): Promise<GetCustomPageAssetResult>;
/**
 * A collection of arguments for invoking getCustomPageAsset.
 */
export interface GetCustomPageAssetArgs {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    accountId?: string;
    /**
     * The unique name of the custom asset. Can only contain letters (A-Z, a-z), numbers (0-9), and underscores (_).
     */
    assetName: string;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getCustomPageAsset.
 */
export interface GetCustomPageAssetResult {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    readonly accountId?: string;
    /**
     * The unique name of the custom asset. Can only contain letters (A-Z, a-z), numbers (0-9), and underscores (_).
     */
    readonly assetName: string;
    /**
     * A short description of the custom asset.
     */
    readonly description: string;
    /**
     * The unique name of the custom asset. Can only contain letters (A-Z, a-z), numbers (0-9), and underscores (_).
     */
    readonly id: string;
    readonly lastUpdated: string;
    /**
     * The unique name of the custom asset. Can only contain letters (A-Z, a-z), numbers (0-9), and underscores (_).
     */
    readonly name: string;
    /**
     * The size of the asset content in bytes.
     */
    readonly sizeBytes: number;
    /**
     * The URL where the asset content is fetched from.
     */
    readonly url: string;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    readonly zoneId?: string;
}
/**
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleCustomPageAsset = cloudflare.getCustomPageAsset({
 *     assetName: "my_custom_error_page",
 *     accountId: "account_id",
 *     zoneId: "zone_id",
 * });
 * ```
 */
export declare function getCustomPageAssetOutput(args: GetCustomPageAssetOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetCustomPageAssetResult>;
/**
 * A collection of arguments for invoking getCustomPageAsset.
 */
export interface GetCustomPageAssetOutputArgs {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * The unique name of the custom asset. Can only contain letters (A-Z, a-z), numbers (0-9), and underscores (_).
     */
    assetName: pulumi.Input<string>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getCustomPageAsset.d.ts.map