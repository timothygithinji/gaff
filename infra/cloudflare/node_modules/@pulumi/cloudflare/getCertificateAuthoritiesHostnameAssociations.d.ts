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
 * const exampleCertificateAuthoritiesHostnameAssociations = cloudflare.getCertificateAuthoritiesHostnameAssociations({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     mtlsCertificateId: "b2134436-2555-4acf-be5b-26c48136575e",
 * });
 * ```
 */
export declare function getCertificateAuthoritiesHostnameAssociations(args?: GetCertificateAuthoritiesHostnameAssociationsArgs, opts?: pulumi.InvokeOptions): Promise<GetCertificateAuthoritiesHostnameAssociationsResult>;
/**
 * A collection of arguments for invoking getCertificateAuthoritiesHostnameAssociations.
 */
export interface GetCertificateAuthoritiesHostnameAssociationsArgs {
    /**
     * The UUID to match against for a certificate that was uploaded to the mTLS Certificate Management endpoint. If no mtls*certificate*id is given, the results will be the hostnames associated to your active Cloudflare Managed CA.
     */
    mtlsCertificateId?: string;
    /**
     * Identifier.
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getCertificateAuthoritiesHostnameAssociations.
 */
export interface GetCertificateAuthoritiesHostnameAssociationsResult {
    readonly hostnames: string[];
    /**
     * Identifier.
     */
    readonly id: string;
    /**
     * The UUID to match against for a certificate that was uploaded to the mTLS Certificate Management endpoint. If no mtls*certificate*id is given, the results will be the hostnames associated to your active Cloudflare Managed CA.
     */
    readonly mtlsCertificateId?: string;
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
 * const exampleCertificateAuthoritiesHostnameAssociations = cloudflare.getCertificateAuthoritiesHostnameAssociations({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     mtlsCertificateId: "b2134436-2555-4acf-be5b-26c48136575e",
 * });
 * ```
 */
export declare function getCertificateAuthoritiesHostnameAssociationsOutput(args?: GetCertificateAuthoritiesHostnameAssociationsOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetCertificateAuthoritiesHostnameAssociationsResult>;
/**
 * A collection of arguments for invoking getCertificateAuthoritiesHostnameAssociations.
 */
export interface GetCertificateAuthoritiesHostnameAssociationsOutputArgs {
    /**
     * The UUID to match against for a certificate that was uploaded to the mTLS Certificate Management endpoint. If no mtls*certificate*id is given, the results will be the hostnames associated to your active Cloudflare Managed CA.
     */
    mtlsCertificateId?: pulumi.Input<string | undefined>;
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getCertificateAuthoritiesHostnameAssociations.d.ts.map