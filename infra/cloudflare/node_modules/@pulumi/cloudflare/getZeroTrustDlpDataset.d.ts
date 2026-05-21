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
 * const exampleZeroTrustDlpDataset = cloudflare.getZeroTrustDlpDataset({
 *     accountId: "account_id",
 *     datasetId: "182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e",
 * });
 * ```
 */
export declare function getZeroTrustDlpDataset(args: GetZeroTrustDlpDatasetArgs, opts?: pulumi.InvokeOptions): Promise<GetZeroTrustDlpDatasetResult>;
/**
 * A collection of arguments for invoking getZeroTrustDlpDataset.
 */
export interface GetZeroTrustDlpDatasetArgs {
    accountId?: string;
    datasetId: string;
}
/**
 * A collection of values returned by getZeroTrustDlpDataset.
 */
export interface GetZeroTrustDlpDatasetResult {
    readonly accountId?: string;
    readonly caseSensitive: boolean;
    readonly columns: outputs.GetZeroTrustDlpDatasetColumn[];
    readonly createdAt: string;
    readonly datasetId: string;
    /**
     * The description of the dataset.
     */
    readonly description: string;
    readonly encodingVersion: number;
    /**
     * The ID of this resource.
     */
    readonly id: string;
    readonly name: string;
    readonly numCells: number;
    readonly secret: boolean;
    /**
     * Available values: "empty", "uploading", "pending", "processing", "failed", "complete".
     */
    readonly status: string;
    /**
     * Stores when the dataset was last updated.
     */
    readonly updatedAt: string;
    readonly uploads: outputs.GetZeroTrustDlpDatasetUpload[];
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
 * const exampleZeroTrustDlpDataset = cloudflare.getZeroTrustDlpDataset({
 *     accountId: "account_id",
 *     datasetId: "182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e",
 * });
 * ```
 */
export declare function getZeroTrustDlpDatasetOutput(args: GetZeroTrustDlpDatasetOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetZeroTrustDlpDatasetResult>;
/**
 * A collection of arguments for invoking getZeroTrustDlpDataset.
 */
export interface GetZeroTrustDlpDatasetOutputArgs {
    accountId?: pulumi.Input<string | undefined>;
    datasetId: pulumi.Input<string>;
}
//# sourceMappingURL=getZeroTrustDlpDataset.d.ts.map