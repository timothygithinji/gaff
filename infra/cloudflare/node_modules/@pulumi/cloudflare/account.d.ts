import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Account Firewall Access Rules Read`
 * - `Account Firewall Access Rules Write`
 * - `Account Settings Read`
 * - `Account Settings Write`
 * - `Billing Read`
 * - `Billing Write`
 * - `DDoS Botnet Feed Read`
 * - `DDoS Botnet Feed Write`
 * - `DDoS Protection Read`
 * - `DDoS Protection Write`
 * - `DNS Firewall Read`
 * - `DNS Firewall Write`
 * - `DNS View Read`
 * - `DNS View Write`
 * - `Load Balancers Account Read`
 * - `Load Balancers Account Write`
 * - `Load Balancing: Monitors and Pools Read`
 * - `Load Balancing: Monitors and Pools Write`
 * - `SCIM Provisioning`
 * - `Trust and Safety Read`
 * - `Trust and Safety Write`
 * - `Workers KV Storage Read`
 * - `Workers KV Storage Write`
 * - `Workers R2 Storage Read`
 * - `Workers R2 Storage Write`
 * - `Workers Scripts Read`
 * - `Workers Scripts Write`
 * - `Workers Tail Read`
 * - `Zero Trust: PII Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleAccount = new cloudflare.Account("example_account", {
 *     name: "name",
 *     type: "standard",
 *     unit: {
 *         id: "f267e341f3dd4697bd3b9f71dd96247f",
 *     },
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/account:Account example '<account_id>'
 * ```
 */
export declare class Account extends pulumi.CustomResource {
    /**
     * Get an existing Account resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: AccountState, opts?: pulumi.CustomResourceOptions): Account;
    /**
     * Returns true if the given object is an instance of Account.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Account;
    /**
     * Timestamp for the creation of the account
     */
    readonly createdOn: pulumi.Output<string>;
    /**
     * Parent container details
     */
    readonly managedBy: pulumi.Output<outputs.AccountManagedBy>;
    /**
     * Account name
     */
    readonly name: pulumi.Output<string>;
    /**
     * Account settings
     */
    readonly settings: pulumi.Output<outputs.AccountSettings>;
    /**
     * Available values: "standard", "enterprise".
     *
     * @deprecated The 'type' field should no longer be set through the API.
     */
    readonly type: pulumi.Output<string>;
    /**
     * information related to the tenant unit, and optionally, an id of the unit to create the account on. see https://developers.cloudflare.com/tenant/how-to/manage-accounts/
     */
    readonly unit: pulumi.Output<outputs.AccountUnit>;
    /**
     * Create a Account resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: AccountArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Account resources.
 */
export interface AccountState {
    /**
     * Timestamp for the creation of the account
     */
    createdOn?: pulumi.Input<string | undefined>;
    /**
     * Parent container details
     */
    managedBy?: pulumi.Input<inputs.AccountManagedBy | undefined>;
    /**
     * Account name
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * Account settings
     */
    settings?: pulumi.Input<inputs.AccountSettings | undefined>;
    /**
     * Available values: "standard", "enterprise".
     *
     * @deprecated The 'type' field should no longer be set through the API.
     */
    type?: pulumi.Input<string | undefined>;
    /**
     * information related to the tenant unit, and optionally, an id of the unit to create the account on. see https://developers.cloudflare.com/tenant/how-to/manage-accounts/
     */
    unit?: pulumi.Input<inputs.AccountUnit | undefined>;
}
/**
 * The set of arguments for constructing a Account resource.
 */
export interface AccountArgs {
    /**
     * Parent container details
     */
    managedBy?: pulumi.Input<inputs.AccountManagedBy | undefined>;
    /**
     * Account name
     */
    name: pulumi.Input<string>;
    /**
     * Account settings
     */
    settings?: pulumi.Input<inputs.AccountSettings | undefined>;
    /**
     * Available values: "standard", "enterprise".
     *
     * @deprecated The 'type' field should no longer be set through the API.
     */
    type?: pulumi.Input<string | undefined>;
    /**
     * information related to the tenant unit, and optionally, an id of the unit to create the account on. see https://developers.cloudflare.com/tenant/how-to/manage-accounts/
     */
    unit?: pulumi.Input<inputs.AccountUnit | undefined>;
}
//# sourceMappingURL=account.d.ts.map