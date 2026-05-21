import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Access: Apps and Policies Read`
 * - `Access: Apps and Policies Revoke`
 * - `Access: Apps and Policies Write`
 * - `Access: Mutual TLS Certificates Write`
 * - `Access: Organizations, Identity Providers, and Groups Write`
 * - `Analytics Read`
 * - `Apps Write`
 * - `Cache Purge`
 * - `DNS Read`
 * - `DNS Write`
 * - `Firewall Services Read`
 * - `Firewall Services Write`
 * - `Load Balancers Read`
 * - `Load Balancers Write`
 * - `Logs Read`
 * - `Logs Write`
 * - `Page Rules Read`
 * - `Page Rules Write`
 * - `SSL and Certificates Read`
 * - `SSL and Certificates Write`
 * - `Stream Read`
 * - `Stream Write`
 * - `Trust and Safety Read`
 * - `Trust and Safety Write`
 * - `Workers Routes Read`
 * - `Workers Routes Write`
 * - `Workers Scripts Read`
 * - `Workers Scripts Write`
 * - `Zaraz Admin`
 * - `Zaraz Edit`
 * - `Zaraz Read`
 * - `Zero Trust: PII Read`
 * - `Zone DNS Edit`
 * - `Zone Read`
 * - `Zone Settings Read`
 * - `Zone Settings Write`
 * - `Zone Write`
 * - `Zone Zone Edit`
 *
 * > If you are attempting to sign up a subdomain of a zone you must first have Subdomain Support entitlement for your account.
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleZone = new cloudflare.Zone("example_zone", {
 *     account: {
 *         id: "023e105f4ecef8ad9ca31a8372d0c353",
 *     },
 *     name: "example.com",
 *     type: "full",
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/zone:Zone example '<zone_id>'
 * ```
 */
export declare class Zone extends pulumi.CustomResource {
    /**
     * Get an existing Zone resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ZoneState, opts?: pulumi.CustomResourceOptions): Zone;
    /**
     * Returns true if the given object is an instance of Zone.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is Zone;
    readonly account: pulumi.Output<outputs.ZoneAccount>;
    /**
     * The last time proof of ownership was detected and the zone was made
     * active.
     */
    readonly activatedOn: pulumi.Output<string>;
    /**
     * Allows the customer to use a custom apex.
     * *Tenants Only Configuration*.
     */
    readonly cnameSuffix: pulumi.Output<string>;
    /**
     * When the zone was created.
     */
    readonly createdOn: pulumi.Output<string>;
    /**
     * The interval (in seconds) from when development mode expires
     * (positive integer) or last expired (negative integer) for the
     * domain. If development mode has never been enabled, this value is 0.
     */
    readonly developmentMode: pulumi.Output<number>;
    /**
     * Metadata about the zone.
     */
    readonly meta: pulumi.Output<outputs.ZoneMeta>;
    /**
     * When the zone was last modified.
     */
    readonly modifiedOn: pulumi.Output<string>;
    /**
     * The domain name. Per [RFC 1035](https://datatracker.ietf.org/doc/html/rfc1035#section-2.3.4) the overall zone name can be up to 253 characters, with each segment ("label") not exceeding 63 characters.
     */
    readonly name: pulumi.Output<string>;
    /**
     * The name servers Cloudflare assigns to a zone.
     */
    readonly nameServers: pulumi.Output<string[]>;
    /**
     * DNS host at the time of switching to Cloudflare.
     */
    readonly originalDnshost: pulumi.Output<string>;
    /**
     * Original name servers before moving to Cloudflare.
     */
    readonly originalNameServers: pulumi.Output<string[]>;
    /**
     * Registrar for the domain at the time of switching to Cloudflare.
     */
    readonly originalRegistrar: pulumi.Output<string>;
    /**
     * The owner of the zone.
     */
    readonly owner: pulumi.Output<outputs.ZoneOwner>;
    /**
     * Indicates whether the zone is only using Cloudflare DNS services. A
     * true value means the zone will not receive security or performance
     * benefits.
     */
    readonly paused: pulumi.Output<boolean>;
    /**
     * Legacy permissions based on legacy user membership information.
     *
     * @deprecated This has been replaced by Account memberships.
     */
    readonly permissions: pulumi.Output<string[]>;
    /**
     * A Zones subscription information.
     *
     * @deprecated Please use the `/zones/{zone_id}/subscription` API
to update a zone's plan. Changing this value will create/cancel
associated subscriptions. To view available plans for this zone,
see [Zone Plans](https://developers.cloudflare.com/api/resources/zones/subresources/plans/).
     */
    readonly plan: pulumi.Output<outputs.ZonePlan>;
    /**
     * The zone status on Cloudflare.
     * Available values: "initializing", "pending", "active", "moved".
     */
    readonly status: pulumi.Output<string>;
    /**
     * The root organizational unit that this zone belongs to (such as a tenant or organization).
     */
    readonly tenant: pulumi.Output<outputs.ZoneTenant>;
    /**
     * The immediate parent organizational unit that this zone belongs to (such as under a tenant or sub-organization).
     */
    readonly tenantUnit: pulumi.Output<outputs.ZoneTenantUnit>;
    /**
     * A full zone implies that DNS is hosted with Cloudflare. A partial zone is
     * typically a partner-hosted zone or a CNAME setup.
     * Available values: "full", "partial", "secondary", "internal".
     */
    readonly type: pulumi.Output<string>;
    /**
     * An array of domains used for custom name servers. This is only
     * available for Business and Enterprise plans.
     */
    readonly vanityNameServers: pulumi.Output<string[]>;
    /**
     * Verification key for partial zone setup.
     */
    readonly verificationKey: pulumi.Output<string>;
    /**
     * Create a Zone resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ZoneArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering Zone resources.
 */
export interface ZoneState {
    account?: pulumi.Input<inputs.ZoneAccount | undefined>;
    /**
     * The last time proof of ownership was detected and the zone was made
     * active.
     */
    activatedOn?: pulumi.Input<string | undefined>;
    /**
     * Allows the customer to use a custom apex.
     * *Tenants Only Configuration*.
     */
    cnameSuffix?: pulumi.Input<string | undefined>;
    /**
     * When the zone was created.
     */
    createdOn?: pulumi.Input<string | undefined>;
    /**
     * The interval (in seconds) from when development mode expires
     * (positive integer) or last expired (negative integer) for the
     * domain. If development mode has never been enabled, this value is 0.
     */
    developmentMode?: pulumi.Input<number | undefined>;
    /**
     * Metadata about the zone.
     */
    meta?: pulumi.Input<inputs.ZoneMeta | undefined>;
    /**
     * When the zone was last modified.
     */
    modifiedOn?: pulumi.Input<string | undefined>;
    /**
     * The domain name. Per [RFC 1035](https://datatracker.ietf.org/doc/html/rfc1035#section-2.3.4) the overall zone name can be up to 253 characters, with each segment ("label") not exceeding 63 characters.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * The name servers Cloudflare assigns to a zone.
     */
    nameServers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * DNS host at the time of switching to Cloudflare.
     */
    originalDnshost?: pulumi.Input<string | undefined>;
    /**
     * Original name servers before moving to Cloudflare.
     */
    originalNameServers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Registrar for the domain at the time of switching to Cloudflare.
     */
    originalRegistrar?: pulumi.Input<string | undefined>;
    /**
     * The owner of the zone.
     */
    owner?: pulumi.Input<inputs.ZoneOwner | undefined>;
    /**
     * Indicates whether the zone is only using Cloudflare DNS services. A
     * true value means the zone will not receive security or performance
     * benefits.
     */
    paused?: pulumi.Input<boolean | undefined>;
    /**
     * Legacy permissions based on legacy user membership information.
     *
     * @deprecated This has been replaced by Account memberships.
     */
    permissions?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * A Zones subscription information.
     *
     * @deprecated Please use the `/zones/{zone_id}/subscription` API
to update a zone's plan. Changing this value will create/cancel
associated subscriptions. To view available plans for this zone,
see [Zone Plans](https://developers.cloudflare.com/api/resources/zones/subresources/plans/).
     */
    plan?: pulumi.Input<inputs.ZonePlan | undefined>;
    /**
     * The zone status on Cloudflare.
     * Available values: "initializing", "pending", "active", "moved".
     */
    status?: pulumi.Input<string | undefined>;
    /**
     * The root organizational unit that this zone belongs to (such as a tenant or organization).
     */
    tenant?: pulumi.Input<inputs.ZoneTenant | undefined>;
    /**
     * The immediate parent organizational unit that this zone belongs to (such as under a tenant or sub-organization).
     */
    tenantUnit?: pulumi.Input<inputs.ZoneTenantUnit | undefined>;
    /**
     * A full zone implies that DNS is hosted with Cloudflare. A partial zone is
     * typically a partner-hosted zone or a CNAME setup.
     * Available values: "full", "partial", "secondary", "internal".
     */
    type?: pulumi.Input<string | undefined>;
    /**
     * An array of domains used for custom name servers. This is only
     * available for Business and Enterprise plans.
     */
    vanityNameServers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * Verification key for partial zone setup.
     */
    verificationKey?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a Zone resource.
 */
export interface ZoneArgs {
    account: pulumi.Input<inputs.ZoneAccount>;
    /**
     * The domain name. Per [RFC 1035](https://datatracker.ietf.org/doc/html/rfc1035#section-2.3.4) the overall zone name can be up to 253 characters, with each segment ("label") not exceeding 63 characters.
     */
    name: pulumi.Input<string>;
    /**
     * Indicates whether the zone is only using Cloudflare DNS services. A
     * true value means the zone will not receive security or performance
     * benefits.
     */
    paused?: pulumi.Input<boolean | undefined>;
    /**
     * A full zone implies that DNS is hosted with Cloudflare. A partial zone is
     * typically a partner-hosted zone or a CNAME setup.
     * Available values: "full", "partial", "secondary", "internal".
     */
    type?: pulumi.Input<string | undefined>;
    /**
     * An array of domains used for custom name servers. This is only
     * available for Business and Enterprise plans.
     */
    vanityNameServers?: pulumi.Input<pulumi.Input<string>[] | undefined>;
}
//# sourceMappingURL=zone.d.ts.map