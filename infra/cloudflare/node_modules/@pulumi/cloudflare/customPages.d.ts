import * as pulumi from "@pulumi/pulumi";
/**
 * Accepted Permissions
 *
 * - `Account Custom Pages Read`
 * - `Account Custom Pages Write`
 * - `Account Settings Read`
 * - `Account Settings Write`
 * - `Zero Trust: PII Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleCustomPages = new cloudflare.CustomPages("example_custom_pages", {
 *     identifier: "ratelimit_block",
 *     state: "default",
 *     url: "http://www.example.com",
 *     zoneId: "zone_id",
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/customPages:CustomPages example '<{accounts|zones}/{account_id|zone_id}>/<identifier>'
 * ```
 */
export declare class CustomPages extends pulumi.CustomResource {
    /**
     * Get an existing CustomPages resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: CustomPagesState, opts?: pulumi.CustomResourceOptions): CustomPages;
    /**
     * Returns true if the given object is an instance of CustomPages.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is CustomPages;
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    readonly accountId: pulumi.Output<string | undefined>;
    readonly createdOn: pulumi.Output<string>;
    readonly description: pulumi.Output<string>;
    /**
     * Error Page Types
     * Available values: "1000*errors", "500*errors", "basic*challenge", "country*challenge", "ip*block", "managed*challenge", "ratelimit*block", "under*attack", "waf*block", "waf*challenge".
     */
    readonly identifier: pulumi.Output<string>;
    readonly modifiedOn: pulumi.Output<string>;
    readonly previewTarget: pulumi.Output<string>;
    readonly requiredTokens: pulumi.Output<string[]>;
    /**
     * The custom page state.
     * Available values: "default", "customized".
     */
    readonly state: pulumi.Output<string>;
    /**
     * The URL associated with the custom page.
     */
    readonly url: pulumi.Output<string>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    readonly zoneId: pulumi.Output<string | undefined>;
    /**
     * Create a CustomPages resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: CustomPagesArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering CustomPages resources.
 */
export interface CustomPagesState {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    accountId?: pulumi.Input<string | undefined>;
    createdOn?: pulumi.Input<string | undefined>;
    description?: pulumi.Input<string | undefined>;
    /**
     * Error Page Types
     * Available values: "1000*errors", "500*errors", "basic*challenge", "country*challenge", "ip*block", "managed*challenge", "ratelimit*block", "under*attack", "waf*block", "waf*challenge".
     */
    identifier?: pulumi.Input<string | undefined>;
    modifiedOn?: pulumi.Input<string | undefined>;
    previewTarget?: pulumi.Input<string | undefined>;
    requiredTokens?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The custom page state.
     * Available values: "default", "customized".
     */
    state?: pulumi.Input<string | undefined>;
    /**
     * The URL associated with the custom page.
     */
    url?: pulumi.Input<string | undefined>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a CustomPages resource.
 */
export interface CustomPagesArgs {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * Error Page Types
     * Available values: "1000*errors", "500*errors", "basic*challenge", "country*challenge", "ip*block", "managed*challenge", "ratelimit*block", "under*attack", "waf*block", "waf*challenge".
     */
    identifier: pulumi.Input<string>;
    /**
     * The custom page state.
     * Available values: "default", "customized".
     */
    state: pulumi.Input<string>;
    /**
     * The URL associated with the custom page.
     */
    url?: pulumi.Input<string | undefined>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=customPages.d.ts.map