import * as pulumi from "@pulumi/pulumi";
/**
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleCustomPageAsset = new cloudflare.CustomPageAsset("example_custom_page_asset", {
 *     description: "Custom 500 error page",
 *     name: "my_custom_error_page",
 *     url: "https://example.com/error.html",
 *     zoneId: "zone_id",
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/customPageAsset:CustomPageAsset example '<{accounts|zones}/{account_id|zone_id}>/<asset_name>'
 * ```
 */
export declare class CustomPageAsset extends pulumi.CustomResource {
    /**
     * Get an existing CustomPageAsset resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: CustomPageAssetState, opts?: pulumi.CustomResourceOptions): CustomPageAsset;
    /**
     * Returns true if the given object is an instance of CustomPageAsset.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is CustomPageAsset;
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    readonly accountId: pulumi.Output<string | undefined>;
    /**
     * A short description of the custom asset.
     */
    readonly description: pulumi.Output<string>;
    readonly lastUpdated: pulumi.Output<string>;
    /**
     * The unique name of the custom asset. Can only contain letters (A-Z, a-z), numbers (0-9), and underscores (_).
     */
    readonly name: pulumi.Output<string>;
    /**
     * The size of the asset content in bytes.
     */
    readonly sizeBytes: pulumi.Output<number>;
    /**
     * The URL where the asset content is fetched from.
     */
    readonly url: pulumi.Output<string>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    readonly zoneId: pulumi.Output<string | undefined>;
    /**
     * Create a CustomPageAsset resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: CustomPageAssetArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering CustomPageAsset resources.
 */
export interface CustomPageAssetState {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * A short description of the custom asset.
     */
    description?: pulumi.Input<string | undefined>;
    lastUpdated?: pulumi.Input<string | undefined>;
    /**
     * The unique name of the custom asset. Can only contain letters (A-Z, a-z), numbers (0-9), and underscores (_).
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * The size of the asset content in bytes.
     */
    sizeBytes?: pulumi.Input<number | undefined>;
    /**
     * The URL where the asset content is fetched from.
     */
    url?: pulumi.Input<string | undefined>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a CustomPageAsset resource.
 */
export interface CustomPageAssetArgs {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * A short description of the custom asset.
     */
    description: pulumi.Input<string>;
    /**
     * The unique name of the custom asset. Can only contain letters (A-Z, a-z), numbers (0-9), and underscores (_).
     */
    name: pulumi.Input<string>;
    /**
     * The URL where the asset content is fetched from.
     */
    url: pulumi.Input<string>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=customPageAsset.d.ts.map