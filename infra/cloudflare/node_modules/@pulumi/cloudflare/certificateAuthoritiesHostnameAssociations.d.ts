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
 * const exampleCertificateAuthoritiesHostnameAssociations = new cloudflare.CertificateAuthoritiesHostnameAssociations("example_certificate_authorities_hostname_associations", {
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     hostnames: ["api.example.com"],
 *     mtlsCertificateId: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/certificateAuthoritiesHostnameAssociations:CertificateAuthoritiesHostnameAssociations example '<zone_id>'
 * ```
 */
export declare class CertificateAuthoritiesHostnameAssociations extends pulumi.CustomResource {
    /**
     * Get an existing CertificateAuthoritiesHostnameAssociations resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: CertificateAuthoritiesHostnameAssociationsState, opts?: pulumi.CustomResourceOptions): CertificateAuthoritiesHostnameAssociations;
    /**
     * Returns true if the given object is an instance of CertificateAuthoritiesHostnameAssociations.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is CertificateAuthoritiesHostnameAssociations;
    readonly hostnames: pulumi.Output<string[] | undefined>;
    /**
     * The UUID for a certificate that was uploaded to the mTLS Certificate Management endpoint. If no mtls*certificate*id is given, the hostnames will be associated to your active Cloudflare Managed CA.
     */
    readonly mtlsCertificateId: pulumi.Output<string | undefined>;
    /**
     * Identifier.
     */
    readonly zoneId: pulumi.Output<string>;
    /**
     * Create a CertificateAuthoritiesHostnameAssociations resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: CertificateAuthoritiesHostnameAssociationsArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering CertificateAuthoritiesHostnameAssociations resources.
 */
export interface CertificateAuthoritiesHostnameAssociationsState {
    hostnames?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The UUID for a certificate that was uploaded to the mTLS Certificate Management endpoint. If no mtls*certificate*id is given, the hostnames will be associated to your active Cloudflare Managed CA.
     */
    mtlsCertificateId?: pulumi.Input<string | undefined>;
    /**
     * Identifier.
     */
    zoneId?: pulumi.Input<string | undefined>;
}
/**
 * The set of arguments for constructing a CertificateAuthoritiesHostnameAssociations resource.
 */
export interface CertificateAuthoritiesHostnameAssociationsArgs {
    hostnames?: pulumi.Input<pulumi.Input<string>[] | undefined>;
    /**
     * The UUID for a certificate that was uploaded to the mTLS Certificate Management endpoint. If no mtls*certificate*id is given, the hostnames will be associated to your active Cloudflare Managed CA.
     */
    mtlsCertificateId?: pulumi.Input<string | undefined>;
    /**
     * Identifier.
     */
    zoneId: pulumi.Input<string>;
}
//# sourceMappingURL=certificateAuthoritiesHostnameAssociations.d.ts.map