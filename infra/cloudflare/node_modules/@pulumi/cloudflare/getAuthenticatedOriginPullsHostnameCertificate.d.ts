import * as pulumi from "@pulumi/pulumi";
/**
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleAuthenticatedOriginPullsHostnameCertificate = cloudflare.getAuthenticatedOriginPullsHostnameCertificate({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     certificateId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getAuthenticatedOriginPullsHostnameCertificate(args: GetAuthenticatedOriginPullsHostnameCertificateArgs, opts?: pulumi.InvokeOptions): Promise<GetAuthenticatedOriginPullsHostnameCertificateResult>;
/**
 * A collection of arguments for invoking getAuthenticatedOriginPullsHostnameCertificate.
 */
export interface GetAuthenticatedOriginPullsHostnameCertificateArgs {
    /**
     * Identifier.
     */
    certificateId: string;
    /**
     * Identifier.
     */
    zoneId: string;
}
/**
 * A collection of values returned by getAuthenticatedOriginPullsHostnameCertificate.
 */
export interface GetAuthenticatedOriginPullsHostnameCertificateResult {
    /**
     * The hostname certificate.
     */
    readonly certificate: string;
    /**
     * Identifier.
     */
    readonly certificateId: string;
    /**
     * The date when the certificate expires.
     */
    readonly expiresOn: string;
    /**
     * Identifier.
     */
    readonly id: string;
    /**
     * The certificate authority that issued the certificate.
     */
    readonly issuer: string;
    /**
     * The serial number on the uploaded certificate.
     */
    readonly serialNumber: string;
    /**
     * The type of hash used for the certificate.
     */
    readonly signature: string;
    /**
     * Status of the certificate or the association.
     * Available values: "initializing", "pending*deployment", "pending*deletion", "active", "deleted", "deployment*timed*out", "deletion*timed*out".
     */
    readonly status: string;
    /**
     * The time when the certificate was uploaded.
     */
    readonly uploadedOn: string;
    /**
     * Identifier.
     */
    readonly zoneId: string;
}
/**
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleAuthenticatedOriginPullsHostnameCertificate = cloudflare.getAuthenticatedOriginPullsHostnameCertificate({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     certificateId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getAuthenticatedOriginPullsHostnameCertificateOutput(args: GetAuthenticatedOriginPullsHostnameCertificateOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetAuthenticatedOriginPullsHostnameCertificateResult>;
/**
 * A collection of arguments for invoking getAuthenticatedOriginPullsHostnameCertificate.
 */
export interface GetAuthenticatedOriginPullsHostnameCertificateOutputArgs {
    /**
     * Identifier.
     */
    certificateId: pulumi.Input<string>;
    /**
     * Identifier.
     */
    zoneId: pulumi.Input<string>;
}
//# sourceMappingURL=getAuthenticatedOriginPullsHostnameCertificate.d.ts.map