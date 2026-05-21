import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
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
 * const examplePipelineSink = cloudflare.getPipelineSink({
 *     accountId: "0123105f4ecef8ad9ca31a8372d0c353",
 *     sinkId: "0223105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getPipelineSink(args?: GetPipelineSinkArgs, opts?: pulumi.InvokeOptions): Promise<GetPipelineSinkResult>;
/**
 * A collection of arguments for invoking getPipelineSink.
 */
export interface GetPipelineSinkArgs {
    /**
     * Specifies the public ID of the account.
     */
    accountId?: string;
    filter?: inputs.GetPipelineSinkFilter;
    /**
     * Specifies the publid ID of the sink.
     */
    sinkId?: string;
}
/**
 * A collection of values returned by getPipelineSink.
 */
export interface GetPipelineSinkResult {
    /**
     * Specifies the public ID of the account.
     */
    readonly accountId?: string;
    /**
     * Defines the configuration of the R2 Sink.
     */
    readonly config: outputs.GetPipelineSinkConfig;
    readonly createdAt: string;
    readonly filter?: outputs.GetPipelineSinkFilter;
    readonly format: outputs.GetPipelineSinkFormat;
    /**
     * Specifies the publid ID of the sink.
     */
    readonly id: string;
    readonly modifiedAt: string;
    /**
     * Defines the name of the Sink.
     */
    readonly name: string;
    readonly schema: outputs.GetPipelineSinkSchema;
    /**
     * Specifies the publid ID of the sink.
     */
    readonly sinkId?: string;
    /**
     * Specifies the type of sink.
     * Available values: "r2", "r2*data*catalog".
     */
    readonly type: string;
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
 * const examplePipelineSink = cloudflare.getPipelineSink({
 *     accountId: "0123105f4ecef8ad9ca31a8372d0c353",
 *     sinkId: "0223105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getPipelineSinkOutput(args?: GetPipelineSinkOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetPipelineSinkResult>;
/**
 * A collection of arguments for invoking getPipelineSink.
 */
export interface GetPipelineSinkOutputArgs {
    /**
     * Specifies the public ID of the account.
     */
    accountId?: pulumi.Input<string | undefined>;
    filter?: pulumi.Input<inputs.GetPipelineSinkFilterArgs | undefined>;
    /**
     * Specifies the publid ID of the sink.
     */
    sinkId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getPipelineSink.d.ts.map