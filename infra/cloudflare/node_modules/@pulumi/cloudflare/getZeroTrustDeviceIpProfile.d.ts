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
 * const exampleZeroTrustDeviceIpProfile = cloudflare.getZeroTrustDeviceIpProfile({
 *     accountId: "account_id",
 *     profileId: "profile_id",
 * });
 * ```
 */
export declare function getZeroTrustDeviceIpProfile(args?: GetZeroTrustDeviceIpProfileArgs, opts?: pulumi.InvokeOptions): Promise<GetZeroTrustDeviceIpProfileResult>;
/**
 * A collection of arguments for invoking getZeroTrustDeviceIpProfile.
 */
export interface GetZeroTrustDeviceIpProfileArgs {
    accountId?: string;
    filter?: inputs.GetZeroTrustDeviceIpProfileFilter;
    profileId?: string;
}
/**
 * A collection of values returned by getZeroTrustDeviceIpProfile.
 */
export interface GetZeroTrustDeviceIpProfileResult {
    readonly accountId?: string;
    /**
     * The RFC3339Nano timestamp when the Device IP profile was created.
     */
    readonly createdAt: string;
    /**
     * An optional description of the Device IP profile.
     */
    readonly description: string;
    /**
     * Whether the Device IP profile is enabled.
     */
    readonly enabled: boolean;
    readonly filter?: outputs.GetZeroTrustDeviceIpProfileFilter;
    /**
     * The ID of this resource.
     */
    readonly id: string;
    /**
     * The wirefilter expression to match registrations. Available values: "identity.name", "identity.email", "identity.groups.id", "identity.groups.name", "identity.groups.email", "identity.saml_attributes".
     */
    readonly match: string;
    /**
     * A user-friendly name for the Device IP profile.
     */
    readonly name: string;
    /**
     * The precedence of the Device IP profile. Lower values indicate higher precedence. Device IP profile will be evaluated in ascending order of this field.
     */
    readonly precedence: number;
    readonly profileId?: string;
    /**
     * The ID of the Subnet.
     */
    readonly subnetId: string;
    /**
     * The RFC3339Nano timestamp when the Device IP profile was last updated.
     */
    readonly updatedAt: string;
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
 * const exampleZeroTrustDeviceIpProfile = cloudflare.getZeroTrustDeviceIpProfile({
 *     accountId: "account_id",
 *     profileId: "profile_id",
 * });
 * ```
 */
export declare function getZeroTrustDeviceIpProfileOutput(args?: GetZeroTrustDeviceIpProfileOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetZeroTrustDeviceIpProfileResult>;
/**
 * A collection of arguments for invoking getZeroTrustDeviceIpProfile.
 */
export interface GetZeroTrustDeviceIpProfileOutputArgs {
    accountId?: pulumi.Input<string | undefined>;
    filter?: pulumi.Input<inputs.GetZeroTrustDeviceIpProfileFilterArgs | undefined>;
    profileId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getZeroTrustDeviceIpProfile.d.ts.map