import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Workers R2 Data Catalog Read`
 * - `Workers R2 Data Catalog Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleR2DataCatalog = cloudflare.getR2DataCatalog({
 *     accountId: "0123456789abcdef0123456789abcdef",
 *     bucketName: "my-data-bucket",
 * });
 * ```
 */
export declare function getR2DataCatalog(args: GetR2DataCatalogArgs, opts?: pulumi.InvokeOptions): Promise<GetR2DataCatalogResult>;
/**
 * A collection of arguments for invoking getR2DataCatalog.
 */
export interface GetR2DataCatalogArgs {
    /**
     * Use this to identify the account.
     */
    accountId?: string;
    /**
     * Specifies the R2 bucket name.
     */
    bucketName: string;
}
/**
 * A collection of values returned by getR2DataCatalog.
 */
export interface GetR2DataCatalogResult {
    /**
     * Use this to identify the account.
     */
    readonly accountId?: string;
    /**
     * Specifies the associated R2 bucket name.
     */
    readonly bucket: string;
    /**
     * Specifies the R2 bucket name.
     */
    readonly bucketName: string;
    /**
     * Shows the credential configuration status.
     * Available values: "present", "absent".
     */
    readonly credentialStatus: string;
    /**
     * Specifies the R2 bucket name.
     */
    readonly id: string;
    /**
     * Configures maintenance for the catalog.
     */
    readonly maintenanceConfig: outputs.GetR2DataCatalogMaintenanceConfig;
    /**
     * Specifies the catalog name (generated from account and bucket name).
     */
    readonly name: string;
    /**
     * Indicates the status of the catalog.
     * Available values: "active", "inactive".
     */
    readonly status: string;
}
/**
 * Accepted Permissions
 *
 * - `Workers R2 Data Catalog Read`
 * - `Workers R2 Data Catalog Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleR2DataCatalog = cloudflare.getR2DataCatalog({
 *     accountId: "0123456789abcdef0123456789abcdef",
 *     bucketName: "my-data-bucket",
 * });
 * ```
 */
export declare function getR2DataCatalogOutput(args: GetR2DataCatalogOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetR2DataCatalogResult>;
/**
 * A collection of arguments for invoking getR2DataCatalog.
 */
export interface GetR2DataCatalogOutputArgs {
    /**
     * Use this to identify the account.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * Specifies the R2 bucket name.
     */
    bucketName: pulumi.Input<string>;
}
//# sourceMappingURL=getR2DataCatalog.d.ts.map