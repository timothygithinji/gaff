import * as pulumi from "@pulumi/pulumi";
/**
 * Accepted Permissions
 *
 * - `SSL and Certificates Read`
 * - `SSL and Certificates Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleUniversalSslSetting = new cloudflare.UniversalSslSetting("example_universal_ssl_setting", {
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     enabled: true,
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/universalSslSetting:UniversalSslSetting example '<zone_id>'
 * ```
 */
export declare class UniversalSslSetting extends pulumi.CustomResource {
    /**
     * Get an existing UniversalSslSetting resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: UniversalSslSettingState, opts?: pulumi.CustomResourceOptions): UniversalSslSetting;
    /**
     * Returns true if the given object is an instance of UniversalSslSetting.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is UniversalSslSetting;
    /**
     * Disabling Universal SSL removes any currently active Universal SSL certificates for your zone from the edge and prevents any future Universal SSL certificates from being ordered. If there are no advanced certificates or custom certificates uploaded for the domain, visitors will be unable to access the domain over HTTPS.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    /**
     * Identifier.
     */
    readonly zoneId: pulumi.Output<string>;
    /**
     * Create a UniversalSslSetting resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: UniversalSslSettingArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering UniversalSslSetting resources.
 */
export interface UniversalSslSettingState {
    /**
     * Disabling Universal SSL removes any currently active Universal SSL certificates for your zone from the edge and prevents any future Universal SSL certificates from being ordered. If there are no advanced certificates or custom certificates uploaded for the domain, visitors will be unable to access the domain over HTTPS.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a UniversalSslSetting resource.
 */
export interface UniversalSslSettingArgs {
    /**
     * Disabling Universal SSL removes any currently active Universal SSL certificates for your zone from the edge and prevents any future Universal SSL certificates from being ordered. If there are no advanced certificates or custom certificates uploaded for the domain, visitors will be unable to access the domain over HTTPS.
     */
    enabled?: pulumi.Input<boolean | undefined>;
    /**
     * Identifier.
     */
    zoneId: pulumi.Input<string>;
}
//# sourceMappingURL=universalSslSetting.d.ts.map