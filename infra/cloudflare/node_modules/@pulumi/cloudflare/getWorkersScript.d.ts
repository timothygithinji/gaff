import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Workers Scripts Read`
 * - `Workers Scripts Write`
 * - `Workers Tail Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleWorkersScript = cloudflare.getWorkersScript({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     scriptName: "this-is_my_script-01",
 * });
 * ```
 */
export declare function getWorkersScript(args?: GetWorkersScriptArgs, opts?: pulumi.InvokeOptions): Promise<GetWorkersScriptResult>;
/**
 * A collection of arguments for invoking getWorkersScript.
 */
export interface GetWorkersScriptArgs {
    /**
     * Identifier.
     */
    accountId?: string;
    filter?: inputs.GetWorkersScriptFilter;
    /**
     * Name of the script, used in URLs and route configuration.
     */
    scriptName?: string;
}
/**
 * A collection of values returned by getWorkersScript.
 */
export interface GetWorkersScriptResult {
    /**
     * Identifier.
     */
    readonly accountId?: string;
    readonly filter?: outputs.GetWorkersScriptFilter;
    /**
     * Name of the script, used in URLs and route configuration.
     */
    readonly id: string;
    readonly script: string;
    /**
     * Name of the script, used in URLs and route configuration.
     */
    readonly scriptName?: string;
}
/**
 * Accepted Permissions
 *
 * - `Workers Scripts Read`
 * - `Workers Scripts Write`
 * - `Workers Tail Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleWorkersScript = cloudflare.getWorkersScript({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     scriptName: "this-is_my_script-01",
 * });
 * ```
 */
export declare function getWorkersScriptOutput(args?: GetWorkersScriptOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetWorkersScriptResult>;
/**
 * A collection of arguments for invoking getWorkersScript.
 */
export interface GetWorkersScriptOutputArgs {
    /**
     * Identifier.
     */
    accountId?: pulumi.Input<string | undefined>;
    filter?: pulumi.Input<inputs.GetWorkersScriptFilterArgs | undefined>;
    /**
     * Name of the script, used in URLs and route configuration.
     */
    scriptName?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getWorkersScript.d.ts.map