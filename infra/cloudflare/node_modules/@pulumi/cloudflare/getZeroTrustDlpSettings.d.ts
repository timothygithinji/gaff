import * as pulumi from "@pulumi/pulumi";
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
 * const exampleZeroTrustDlpSettings = cloudflare.getZeroTrustDlpSettings({
 *     accountId: "account_id",
 * });
 * ```
 */
export declare function getZeroTrustDlpSettings(args: GetZeroTrustDlpSettingsArgs, opts?: pulumi.InvokeOptions): Promise<GetZeroTrustDlpSettingsResult>;
/**
 * A collection of arguments for invoking getZeroTrustDlpSettings.
 */
export interface GetZeroTrustDlpSettingsArgs {
    accountId: string;
}
/**
 * A collection of values returned by getZeroTrustDlpSettings.
 */
export interface GetZeroTrustDlpSettingsResult {
    readonly accountId: string;
    /**
     * Whether AI context analysis is enabled at the account level.
     */
    readonly aiContextAnalysis: boolean;
    /**
     * The ID of this resource.
     */
    readonly id: string;
    /**
     * Whether OCR is enabled at the account level.
     */
    readonly ocr: boolean;
    readonly payloadLogging: outputs.GetZeroTrustDlpSettingsPayloadLogging;
}
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
 * const exampleZeroTrustDlpSettings = cloudflare.getZeroTrustDlpSettings({
 *     accountId: "account_id",
 * });
 * ```
 */
export declare function getZeroTrustDlpSettingsOutput(args: GetZeroTrustDlpSettingsOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetZeroTrustDlpSettingsResult>;
/**
 * A collection of arguments for invoking getZeroTrustDlpSettings.
 */
export interface GetZeroTrustDlpSettingsOutputArgs {
    accountId: pulumi.Input<string>;
}
//# sourceMappingURL=getZeroTrustDlpSettings.d.ts.map