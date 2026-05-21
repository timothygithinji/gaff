import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Account Settings Read`
 * - `Account Settings Write`
 * - `SCIM Provisioning`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleUserGroup = new cloudflare.UserGroup("example_user_group", {
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     name: "My New User Group",
 *     policies: [{
 *         access: "allow",
 *         permissionGroups: [
 *             {
 *                 id: "c8fed203ed3043cba015a93ad1616f1f",
 *             },
 *             {
 *                 id: "82e64a83756745bbbb1c9c2701bf816b",
 *             },
 *         ],
 *         resourceGroups: [{
 *             id: "6d7f2f5f5b1d4a0e9081fdc98d432fd1",
 *         }],
 *     }],
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/userGroup:UserGroup example '<account_id>/<user_group_id>'
 * ```
 */
export declare class UserGroup extends pulumi.CustomResource {
    /**
     * Get an existing UserGroup resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: UserGroupState, opts?: pulumi.CustomResourceOptions): UserGroup;
    /**
     * Returns true if the given object is an instance of UserGroup.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is UserGroup;
    /**
     * Account identifier tag.
     */
    readonly accountId: pulumi.Output<string>;
    /**
     * Timestamp for the creation of the user group
     */
    readonly createdOn: pulumi.Output<string>;
    /**
     * Last time the user group was modified.
     */
    readonly modifiedOn: pulumi.Output<string>;
    /**
     * Name of the User group.
     */
    readonly name: pulumi.Output<string>;
    /**
     * Policies attached to the User group
     */
    readonly policies: pulumi.Output<outputs.UserGroupPolicy[] | undefined>;
    /**
     * Create a UserGroup resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: UserGroupArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering UserGroup resources.
 */
export interface UserGroupState {
    /**
     * Account identifier tag.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * Timestamp for the creation of the user group
     */
    createdOn?: pulumi.Input<string | undefined>;
    /**
     * Last time the user group was modified.
     */
    modifiedOn?: pulumi.Input<string | undefined>;
    /**
     * Name of the User group.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * Policies attached to the User group
     */
    policies?: pulumi.Input<pulumi.Input<inputs.UserGroupPolicy>[] | undefined>;
}
/**
 * The set of arguments for constructing a UserGroup resource.
 */
export interface UserGroupArgs {
    /**
     * Account identifier tag.
     */
    accountId: pulumi.Input<string>;
    /**
     * Name of the User group.
     */
    name: pulumi.Input<string>;
    /**
     * Policies attached to the User group
     */
    policies?: pulumi.Input<pulumi.Input<inputs.UserGroupPolicy>[] | undefined>;
}
//# sourceMappingURL=userGroup.d.ts.map