import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Pipelines Read`
 * - `Pipelines Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const examplePipeline = cloudflare.getPipeline({
 *     accountId: "0123105f4ecef8ad9ca31a8372d0c353",
 *     pipelineId: "043e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getPipeline(args: GetPipelineArgs, opts?: pulumi.InvokeOptions): Promise<GetPipelineResult>;
/**
 * A collection of arguments for invoking getPipeline.
 */
export interface GetPipelineArgs {
    /**
     * Specifies the public ID of the account.
     */
    accountId?: string;
    /**
     * Specifies the public ID of the pipeline.
     */
    pipelineId: string;
}
/**
 * A collection of values returned by getPipeline.
 */
export interface GetPipelineResult {
    /**
     * Specifies the public ID of the account.
     */
    readonly accountId?: string;
    readonly createdAt: string;
    /**
     * Indicates the reason for the failure of the Pipeline.
     */
    readonly failureReason: string;
    /**
     * Specifies the public ID of the pipeline.
     */
    readonly id: string;
    readonly modifiedAt: string;
    /**
     * Indicates the name of the Pipeline.
     */
    readonly name: string;
    /**
     * Specifies the public ID of the pipeline.
     */
    readonly pipelineId: string;
    /**
     * Specifies SQL for the Pipeline processing flow.
     */
    readonly sql: string;
    /**
     * Indicates the current status of the Pipeline.
     */
    readonly status: string;
    /**
     * List of streams and sinks used by this pipeline.
     */
    readonly tables: outputs.GetPipelineTable[];
}
/**
 * Accepted Permissions
 *
 * - `Pipelines Read`
 * - `Pipelines Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const examplePipeline = cloudflare.getPipeline({
 *     accountId: "0123105f4ecef8ad9ca31a8372d0c353",
 *     pipelineId: "043e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getPipelineOutput(args: GetPipelineOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPipelineResult>;
/**
 * A collection of arguments for invoking getPipeline.
 */
export interface GetPipelineOutputArgs {
    /**
     * Specifies the public ID of the account.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * Specifies the public ID of the pipeline.
     */
    pipelineId: pulumi.Input<string>;
}
//# sourceMappingURL=getPipeline.d.ts.map