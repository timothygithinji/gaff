import * as pulumi from "@pulumi/pulumi";
/**
 * Accepted Permissions
 *
 * - `SSL and Certificates Read`
 * - `SSL and Certificates Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleAuthenticatedOriginPullsSettings = cloudflare.getAuthenticatedOriginPullsSettings({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getAuthenticatedOriginPullsSettings(args?: GetAuthenticatedOriginPullsSettingsArgs, opts?: pulumi.InvokeOptions): Promise<GetAuthenticatedOriginPullsSettingsResult>;
/**
 * A collection of arguments for invoking getAuthenticatedOriginPullsSettings.
 */
export interface GetAuthenticatedOriginPullsSettingsArgs {
    /**
     * Identifier.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getAuthenticatedOriginPullsSettings.
 */
export interface GetAuthenticatedOriginPullsSettingsResult {
    /**
     * Indicates whether zone-level authenticated origin pulls is enabled.
     */
    readonly enabled: boolean;
    /**
     * Identifier.
     */
    readonly id: string;
    /**
     * Identifier.
     */
    readonly zoneId?: string;
}
/**
 * Accepted Permissions
 *
 * - `SSL and Certificates Read`
 * - `SSL and Certificates Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleAuthenticatedOriginPullsSettings = cloudflare.getAuthenticatedOriginPullsSettings({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getAuthenticatedOriginPullsSettingsOutput(args?: GetAuthenticatedOriginPullsSettingsOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetAuthenticatedOriginPullsSettingsResult>;
/**
 * A collection of arguments for invoking getAuthenticatedOriginPullsSettings.
 */
export interface GetAuthenticatedOriginPullsSettingsOutputArgs {
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getAuthenticatedOriginPullsSettings.d.ts.map