import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Billing Read`
 * - `Billing Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleZoneSubscription = new cloudflare.ZoneSubscription("example_zone_subscription", {
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     frequency: "monthly",
 *     ratePlan: {
 *         id: "free",
 *         currency: "USD",
 *         externallyManaged: false,
 *         isContract: false,
 *         publicName: "Business Plan",
 *         scope: "zone",
 *         sets: ["string"],
 *     },
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/zoneSubscription:ZoneSubscription example '<zone_id>'
 * ```
 */
export declare class ZoneSubscription extends pulumi.CustomResource {
    /**
     * Get an existing ZoneSubscription resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ZoneSubscriptionState, opts?: pulumi.CustomResourceOptions): ZoneSubscription;
    /**
     * Returns true if the given object is an instance of ZoneSubscription.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ZoneSubscription;
    /**
     * The monetary unit in which pricing information is displayed.
     */
    readonly currency: pulumi.Output<string>;
    /**
     * The end of the current period and also when the next billing is due.
     */
    readonly currentPeriodEnd: pulumi.Output<string>;
    /**
     * When the current billing period started. May match initial*period*start if this is the first period.
     */
    readonly currentPeriodStart: pulumi.Output<string>;
    /**
     * How often the subscription is renewed automatically.
     * Available values: "weekly", "monthly", "quarterly", "yearly".
     * Note: Some plans may not support frequency configuration and will return "not-applicable".
     */
    readonly frequency: pulumi.Output<string>;
    /**
     * The price of the subscription that will be billed, in US dollars.
     */
    readonly price: pulumi.Output<number>;
    /**
     * The rate plan applied to the subscription.
     */
    readonly ratePlan: pulumi.Output<outputs.ZoneSubscriptionRatePlan>;
    /**
     * The state that the subscription is in.
     * Available values: "Trial", "Provisioned", "Paid", "AwaitingPayment", "Cancelled", "Failed", "Expired".
     */
    readonly state: pulumi.Output<string>;
    /**
     * Identifier
     */
    readonly zoneId: pulumi.Output<string>;
    /**
     * Create a ZoneSubscription resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ZoneSubscriptionArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ZoneSubscription resources.
 */
export interface ZoneSubscriptionState {
    /**
     * The monetary unit in which pricing information is displayed.
     */
    currency?: pulumi.Input<string | undefined>;
    /**
     * The end of the current period and also when the next billing is due.
     */
    currentPeriodEnd?: pulumi.Input<string | undefined>;
    /**
     * When the current billing period started. May match initial*period*start if this is the first period.
     */
    currentPeriodStart?: pulumi.Input<string | undefined>;
    /**
     * How often the subscription is renewed automatically.
     * Available values: "weekly", "monthly", "quarterly", "yearly".
     * Note: Some plans may not support frequency configuration and will return "not-applicable".
     */
    frequency?: pulumi.Input<string | undefined>;
    /**
     * The price of the subscription that will be billed, in US dollars.
     */
    price?: pulumi.Input<number | undefined>;
    /**
     * The rate plan applied to the subscription.
     */
    ratePlan?: pulumi.Input<inputs.ZoneSubscriptionRatePlan | undefined>;
    /**
     * The state that the subscription is in.
     * Available values: "Trial", "Provisioned", "Paid", "AwaitingPayment", "Cancelled", "Failed", "Expired".
     */
    state?: pulumi.Input<string | undefined>;
    /**
     * Identifier
     */
    zoneId?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a ZoneSubscription resource.
 */
export interface ZoneSubscriptionArgs {
    /**
     * How often the subscription is renewed automatically.
     * Available values: "weekly", "monthly", "quarterly", "yearly".
     * Note: Some plans may not support frequency configuration and will return "not-applicable".
     */
    frequency?: pulumi.Input<string | undefined>;
    /**
     * The rate plan applied to the subscription.
     */
    ratePlan?: pulumi.Input<inputs.ZoneSubscriptionRatePlan | undefined>;
    /**
     * Identifier
     */
    zoneId: pulumi.Input<string>;
}
//# sourceMappingURL=zoneSubscription.d.ts.map