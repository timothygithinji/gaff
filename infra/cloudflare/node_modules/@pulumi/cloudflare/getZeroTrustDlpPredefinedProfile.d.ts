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
 * const exampleZeroTrustDlpPredefinedProfile = cloudflare.getZeroTrustDlpPredefinedProfile({
 *     accountId: "account_id",
 *     profileId: "182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e",
 * });
 * ```
 */
export declare function getZeroTrustDlpPredefinedProfile(args: GetZeroTrustDlpPredefinedProfileArgs, opts?: pulumi.InvokeOptions): Promise<GetZeroTrustDlpPredefinedProfileResult>;
/**
 * A collection of arguments for invoking getZeroTrustDlpPredefinedProfile.
 */
export interface GetZeroTrustDlpPredefinedProfileArgs {
    accountId?: string;
    profileId: string;
}
/**
 * A collection of values returned by getZeroTrustDlpPredefinedProfile.
 */
export interface GetZeroTrustDlpPredefinedProfileResult {
    readonly accountId?: string;
    readonly aiContextEnabled: boolean;
    readonly allowedMatchCount: number;
    readonly confidenceThreshold: string;
    /**
     * Entries to enable for this predefined profile. Any entries not provided will be disabled.
     */
    readonly enabledEntries: string[];
    /**
     * This field has been deprecated for `enabledEntries`.
     *
     * @deprecated This attribute is deprecated.
     */
    readonly entries: outputs.GetZeroTrustDlpPredefinedProfileEntry[];
    /**
     * The ID of this resource.
     */
    readonly id: string;
    /**
     * The name of the predefined profile.
     */
    readonly name: string;
    readonly ocrEnabled: boolean;
    /**
     * Whether this profile can be accessed by anyone.
     */
    readonly openAccess: boolean;
    readonly profileId: string;
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
 * const exampleZeroTrustDlpPredefinedProfile = cloudflare.getZeroTrustDlpPredefinedProfile({
 *     accountId: "account_id",
 *     profileId: "182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e",
 * });
 * ```
 */
export declare function getZeroTrustDlpPredefinedProfileOutput(args: GetZeroTrustDlpPredefinedProfileOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetZeroTrustDlpPredefinedProfileResult>;
/**
 * A collection of arguments for invoking getZeroTrustDlpPredefinedProfile.
 */
export interface GetZeroTrustDlpPredefinedProfileOutputArgs {
    accountId?: pulumi.Input<string | undefined>;
    profileId: pulumi.Input<string>;
}
//# sourceMappingURL=getZeroTrustDlpPredefinedProfile.d.ts.map