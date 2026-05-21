import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Account Firewall Access Rules Read`
 * - `Account Firewall Access Rules Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleAccessRule = new cloudflare.AccessRule("example_access_rule", {
 *     configuration: {
 *         target: "ip",
 *         value: "198.51.100.4",
 *     },
 *     mode: "challenge",
 *     zoneId: "zone_id",
 *     notes: "This rule is enabled because of an event that occurred on date X.",
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/accessRule:AccessRule example '<{accounts|zones}/{account_id|zone_id}>/<rule_id>'
 * ```
 */
export declare class AccessRule extends pulumi.CustomResource {
    /**
     * Get an existing AccessRule resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: AccessRuleState, opts?: pulumi.CustomResourceOptions): AccessRule;
    /**
     * Returns true if the given object is an instance of AccessRule.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is AccessRule;
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    readonly accountId: pulumi.Output<string | undefined>;
    /**
     * The available actions that a rule can apply to a matched request.
     */
    readonly allowedModes: pulumi.Output<string[]>;
    /**
     * The rule configuration.
     */
    readonly configuration: pulumi.Output<outputs.AccessRuleConfiguration>;
    /**
     * The timestamp of when the rule was created.
     */
    readonly createdOn: pulumi.Output<string>;
    /**
     * The action to apply to a matched request.
     * Available values: "block", "challenge", "whitelist", "js*challenge", "managed*challenge".
     */
    readonly mode: pulumi.Output<string>;
    /**
     * The timestamp of when the rule was last modified.
     */
    readonly modifiedOn: pulumi.Output<string>;
    /**
     * An informative summary of the rule, typically used as a reminder or explanation.
     */
    readonly notes: pulumi.Output<string>;
    /**
     * All zones owned by the user will have the rule applied.
     */
    readonly scope: pulumi.Output<outputs.AccessRuleScope>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    readonly zoneId: pulumi.Output<string | undefined>;
    /**
     * Create a AccessRule resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: AccessRuleArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering AccessRule resources.
 */
export interface AccessRuleState {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * The available actions that a rule can apply to a matched request.
     */
    allowedModes?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The rule configuration.
     */
    configuration?: pulumi.Input<inputs.AccessRuleConfiguration | undefined>;
    /**
     * The timestamp of when the rule was created.
     */
    createdOn?: pulumi.Input<string | undefined>;
    /**
     * The action to apply to a matched request.
     * Available values: "block", "challenge", "whitelist", "js*challenge", "managed*challenge".
     */
    mode?: pulumi.Input<string | undefined>;
    /**
     * The timestamp of when the rule was last modified.
     */
    modifiedOn?: pulumi.Input<string | undefined>;
    /**
     * An informative summary of the rule, typically used as a reminder or explanation.
     */
    notes?: pulumi.Input<string | undefined>;
    /**
     * All zones owned by the user will have the rule applied.
     */
    scope?: pulumi.Input<inputs.AccessRuleScope | undefined>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a AccessRule resource.
 */
export interface AccessRuleArgs {
    /**
     * The Account ID to use for this endpoint. Mutually exclusive with the Zone ID.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * The rule configuration.
     */
    configuration: pulumi.Input<inputs.AccessRuleConfiguration>;
    /**
     * The action to apply to a matched request.
     * Available values: "block", "challenge", "whitelist", "js*challenge", "managed*challenge".
     */
    mode: pulumi.Input<string>;
    /**
     * An informative summary of the rule, typically used as a reminder or explanation.
     */
    notes?: pulumi.Input<string | undefined>;
    /**
     * The Zone ID to use for this endpoint. Mutually exclusive with the Account ID.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=accessRule.d.ts.map