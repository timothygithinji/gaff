import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Zero Trust Read`
 * - `Zero Trust Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleZeroTrustDlpSettings = new cloudflare.ZeroTrustDlpSettings("example_zero_trust_dlp_settings", {
 *     accountId: "account_id",
 *     aiContextAnalysis: true,
 *     ocr: true,
 *     payloadLogging: {
 *         maskingLevel: "full",
 *         publicKey: "public_key",
 *     },
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/zeroTrustDlpSettings:ZeroTrustDlpSettings example '<account_id>'
 * ```
 */
export declare class ZeroTrustDlpSettings extends pulumi.CustomResource {
    /**
     * Get an existing ZeroTrustDlpSettings resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: ZeroTrustDlpSettingsState, opts?: pulumi.CustomResourceOptions): ZeroTrustDlpSettings;
    /**
     * Returns true if the given object is an instance of ZeroTrustDlpSettings.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is ZeroTrustDlpSettings;
    readonly accountId: pulumi.Output<string>;
    /**
     * Whether AI context analysis is enabled at the account level.
     */
    readonly aiContextAnalysis: pulumi.Output<boolean>;
    /**
     * Whether OCR is enabled at the account level.
     */
    readonly ocr: pulumi.Output<boolean>;
    /**
     * Request model for payload log settings within the DLP settings endpoint.
     * Unlike the legacy endpoint, null and missing are treated identically here
     * (both mean "not provided" for PATCH, "reset to default" for PUT).
     */
    readonly payloadLogging: pulumi.Output<outputs.ZeroTrustDlpSettingsPayloadLogging>;
    /**
     * Create a ZeroTrustDlpSettings resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: ZeroTrustDlpSettingsArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering ZeroTrustDlpSettings resources.
 */
export interface ZeroTrustDlpSettingsState {
    accountId?: pulumi.Input<string | undefined>;
    /**
     * Whether AI context analysis is enabled at the account level.
     */
    aiContextAnalysis?: pulumi.Input<boolean | undefined>;
    /**
     * Whether OCR is enabled at the account level.
     */
    ocr?: pulumi.Input<boolean | undefined>;
    /**
     * Request model for payload log settings within the DLP settings endpoint.
     * Unlike the legacy endpoint, null and missing are treated identically here
     * (both mean "not provided" for PATCH, "reset to default" for PUT).
     */
    payloadLogging?: pulumi.Input<inputs.ZeroTrustDlpSettingsPayloadLogging | undefined>;
}
/**
 * The set of arguments for constructing a ZeroTrustDlpSettings resource.
 */
export interface ZeroTrustDlpSettingsArgs {
    accountId: pulumi.Input<string>;
    /**
     * Whether AI context analysis is enabled at the account level.
     */
    aiContextAnalysis?: pulumi.Input<boolean | undefined>;
    /**
     * Whether OCR is enabled at the account level.
     */
    ocr?: pulumi.Input<boolean | undefined>;
    /**
     * Request model for payload log settings within the DLP settings endpoint.
     * Unlike the legacy endpoint, null and missing are treated identically here
     * (both mean "not provided" for PATCH, "reset to default" for PUT).
     */
    payloadLogging?: pulumi.Input<inputs.ZeroTrustDlpSettingsPayloadLogging | undefined>;
}
//# sourceMappingURL=zeroTrustDlpSettings.d.ts.map