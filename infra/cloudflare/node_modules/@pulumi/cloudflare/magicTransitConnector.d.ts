import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
/**
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleMagicTransitConnector = new cloudflare.MagicTransitConnector("example_magic_transit_connector", {
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     device: {
 *         id: "id",
 *         provisionLicense: true,
 *         serialNumber: "serial_number",
 *     },
 *     activated: true,
 *     interruptWindowDaysOfWeek: ["Sunday"],
 *     interruptWindowDurationHours: 1,
 *     interruptWindowEmbargoDates: ["string"],
 *     interruptWindowHourOfDay: 0,
 *     notes: "notes",
 *     timezone: "timezone",
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/magicTransitConnector:MagicTransitConnector example '<account_id>/<connector_id>'
 * ```
 */
export declare class MagicTransitConnector extends pulumi.CustomResource {
    /**
     * Get an existing MagicTransitConnector resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: MagicTransitConnectorState, opts?: pulumi.CustomResourceOptions): MagicTransitConnector;
    /**
     * Returns true if the given object is an instance of MagicTransitConnector.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is MagicTransitConnector;
    /**
     * Account identifier
     */
    readonly accountId: pulumi.Output<string>;
    readonly activated: pulumi.Output<boolean>;
    readonly device: pulumi.Output<outputs.MagicTransitConnectorDevice>;
    readonly interruptWindowDurationHours: pulumi.Output<number>;
    readonly interruptWindowHourOfDay: pulumi.Output<number>;
    /**
     * License key for the connector. This is only returned on creation and will not be available in subsequent reads.
     */
    readonly licenseKey: pulumi.Output<string>;
    readonly notes: pulumi.Output<string>;
    readonly timezone: pulumi.Output<string>;
    /**
     * Create a MagicTransitConnector resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: MagicTransitConnectorArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering MagicTransitConnector resources.
 */
export interface MagicTransitConnectorState {
    /**
     * Account identifier
     */
    accountId?: pulumi.Input<string | undefined>;
    activated?: pulumi.Input<boolean | undefined>;
    device?: pulumi.Input<inputs.MagicTransitConnectorDevice | undefined>;
    interruptWindowDurationHours?: pulumi.Input<number | undefined>;
    interruptWindowHourOfDay?: pulumi.Input<number | undefined>;
    /**
     * License key for the connector. This is only returned on creation and will not be available in subsequent reads.
     */
    licenseKey?: pulumi.Input<string | undefined>;
    notes?: pulumi.Input<string | undefined>;
    timezone?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a MagicTransitConnector resource.
 */
export interface MagicTransitConnectorArgs {
    /**
     * Account identifier
     */
    accountId: pulumi.Input<string>;
    activated?: pulumi.Input<boolean | undefined>;
    device: pulumi.Input<inputs.MagicTransitConnectorDevice>;
    interruptWindowDurationHours?: pulumi.Input<number | undefined>;
    interruptWindowHourOfDay?: pulumi.Input<number | undefined>;
    notes?: pulumi.Input<string | undefined>;
    timezone?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=magicTransitConnector.d.ts.map