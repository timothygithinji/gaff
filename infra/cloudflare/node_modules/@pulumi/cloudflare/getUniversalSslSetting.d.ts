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
 * const exampleUniversalSslSetting = cloudflare.getUniversalSslSetting({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getUniversalSslSetting(args?: GetUniversalSslSettingArgs, opts?: pulumi.InvokeOptions): Promise<GetUniversalSslSettingResult>;
/**
 * A collection of arguments for invoking getUniversalSslSetting.
 */
export interface GetUniversalSslSettingArgs {
    /**
     * Identifier.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getUniversalSslSetting.
 */
export interface GetUniversalSslSettingResult {
    /**
     * Disabling Universal SSL removes any currently active Universal SSL certificates for your zone from the edge and prevents any future Universal SSL certificates from being ordered. If there are no advanced certificates or custom certificates uploaded for the domain, visitors will be unable to access the domain over HTTPS.
     */
    readonly enabled: boolean;
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
 * const exampleUniversalSslSetting = cloudflare.getUniversalSslSetting({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getUniversalSslSettingOutput(args?: GetUniversalSslSettingOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetUniversalSslSettingResult>;
/**
 * A collection of arguments for invoking getUniversalSslSetting.
 */
export interface GetUniversalSslSettingOutputArgs {
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getUniversalSslSetting.d.ts.map