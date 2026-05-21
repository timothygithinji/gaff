import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Domain Page Shield`
 * - `Domain Page Shield Read`
 * - `Page Shield`
 * - `Page Shield Read`
 * - `Zone Settings Read`
 * - `Zone Settings Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const examplePageShieldScripts = cloudflare.getPageShieldScripts({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     scriptId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getPageShieldScripts(args: GetPageShieldScriptsArgs, opts?: pulumi.InvokeOptions): Promise<GetPageShieldScriptsResult>;
/**
 * A collection of arguments for invoking getPageShieldScripts.
 */
export interface GetPageShieldScriptsArgs {
    /**
     * Identifier
     */
    scriptId: string;
    /**
     * Identifier
     */
    zoneId?: string;
}
/**
 * A collection of values returned by getPageShieldScripts.
 */
export interface GetPageShieldScriptsResult {
    readonly addedAt: string;
    /**
     * The cryptomining score of the JavaScript content.
     */
    readonly cryptominingScore: number;
    /**
     * The dataflow score of the JavaScript content. This field has been deprecated in favour of js*integrity*score.
     *
     * @deprecated This attribute is deprecated.
     */
    readonly dataflowScore: number;
    readonly domainReportedMalicious: boolean;
    /**
     * The timestamp of when the script was last fetched.
     */
    readonly fetchedAt: string;
    readonly firstPageUrl: string;
    readonly firstSeenAt: string;
    /**
     * The computed hash of the analyzed script.
     */
    readonly hash: string;
    readonly host: string;
    /**
     * Identifier
     */
    readonly id: string;
    /**
     * The integrity score of the JavaScript content.
     */
    readonly jsIntegrityScore: number;
    readonly lastSeenAt: string;
    /**
     * The magecart score of the JavaScript content.
     */
    readonly magecartScore: number;
    readonly maliciousDomainCategories: string[];
    readonly maliciousUrlCategories: string[];
    /**
     * The malware score of the JavaScript content.
     */
    readonly malwareScore: number;
    /**
     * The obfuscation score of the JavaScript content. This field has been deprecated in favour of js*integrity*score.
     *
     * @deprecated This attribute is deprecated.
     */
    readonly obfuscationScore: number;
    readonly pageUrls: string[];
    /**
     * Identifier
     */
    readonly scriptId: string;
    readonly url: string;
    readonly urlContainsCdnCgiPath: boolean;
    readonly urlReportedMalicious: boolean;
    readonly versions: outputs.GetPageShieldScriptsVersion[];
    /**
     * Identifier
     */
    readonly zoneId?: string;
}
/**
 * Accepted Permissions
 *
 * - `Domain Page Shield`
 * - `Domain Page Shield Read`
 * - `Page Shield`
 * - `Page Shield Read`
 * - `Zone Settings Read`
 * - `Zone Settings Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const examplePageShieldScripts = cloudflare.getPageShieldScripts({
 *     zoneId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     scriptId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getPageShieldScriptsOutput(args: GetPageShieldScriptsOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPageShieldScriptsResult>;
/**
 * A collection of arguments for invoking getPageShieldScripts.
 */
export interface GetPageShieldScriptsOutputArgs {
    /**
     * Identifier
     */
    scriptId: pulumi.Input<string>;
    /**
     * Identifier
     */
    zoneId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getPageShieldScripts.d.ts.map