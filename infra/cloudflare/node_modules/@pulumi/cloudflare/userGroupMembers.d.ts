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
 * const exampleUserGroupMembers = new cloudflare.UserGroupMembers("example_user_group_members", {
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     userGroupId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     members: [{
 *         id: "023e105f4ecef8ad9ca31a8372d0c353",
 *     }],
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/userGroupMembers:UserGroupMembers example '<account_id>/<user_group_id>'
 * ```
 */
export declare class UserGroupMembers extends pulumi.CustomResource {
    /**
     * Get an existing UserGroupMembers resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: UserGroupMembersState, opts?: pulumi.CustomResourceOptions): UserGroupMembers;
    /**
     * Returns true if the given object is an instance of UserGroupMembers.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is UserGroupMembers;
    /**
     * Account identifier tag.
     */
    readonly accountId: pulumi.Output<string>;
    readonly members: pulumi.Output<outputs.UserGroupMembersMember[]>;
    /**
     * User Group identifier tag.
     */
    readonly userGroupId: pulumi.Output<string>;
    /**
     * Create a UserGroupMembers resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: UserGroupMembersArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering UserGroupMembers resources.
 */
export interface UserGroupMembersState {
    /**
     * Account identifier tag.
     */
    accountId?: pulumi.Input<string | undefined>;
    members?: pulumi.Input<pulumi.Input<inputs.UserGroupMembersMember>[] | undefined>;
    /**
     * User Group identifier tag.
     */
    userGroupId?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a UserGroupMembers resource.
 */
export interface UserGroupMembersArgs {
    /**
     * Account identifier tag.
     */
    accountId: pulumi.Input<string>;
    members: pulumi.Input<pulumi.Input<inputs.UserGroupMembersMember>[]>;
    /**
     * User Group identifier tag.
     */
    userGroupId: pulumi.Input<string>;
}
//# sourceMappingURL=userGroupMembers.d.ts.map