import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `AI Gateway Read`
 * - `AI Gateway Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleAiGatewayDynamicRouting = cloudflare.getAiGatewayDynamicRouting({
 *     accountId: "0d37909e38d3e99c29fa2cd343ac421a",
 *     gatewayId: "54442216",
 *     id: "54442216",
 * });
 * ```
 */
export declare function getAiGatewayDynamicRouting(args: GetAiGatewayDynamicRoutingArgs, opts?: pulumi.InvokeOptions): Promise<GetAiGatewayDynamicRoutingResult>;
/**
 * A collection of arguments for invoking getAiGatewayDynamicRouting.
 */
export interface GetAiGatewayDynamicRoutingArgs {
    accountId?: string;
    gatewayId: string;
    /**
     * The ID of this resource.
     */
    id: string;
}
/**
 * A collection of values returned by getAiGatewayDynamicRouting.
 */
export interface GetAiGatewayDynamicRoutingResult {
    readonly accountId?: string;
    readonly createdAt: string;
    readonly deployment: outputs.GetAiGatewayDynamicRoutingDeployment;
    readonly elements: outputs.GetAiGatewayDynamicRoutingElement[];
    readonly gatewayId: string;
    /**
     * The ID of this resource.
     */
    readonly id: string;
    readonly modifiedAt: string;
    readonly name: string;
    readonly version: outputs.GetAiGatewayDynamicRoutingVersion;
}
/**
 * Accepted Permissions
 *
 * - `AI Gateway Read`
 * - `AI Gateway Write`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleAiGatewayDynamicRouting = cloudflare.getAiGatewayDynamicRouting({
 *     accountId: "0d37909e38d3e99c29fa2cd343ac421a",
 *     gatewayId: "54442216",
 *     id: "54442216",
 * });
 * ```
 */
export declare function getAiGatewayDynamicRoutingOutput(args: GetAiGatewayDynamicRoutingOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetAiGatewayDynamicRoutingResult>;
/**
 * A collection of arguments for invoking getAiGatewayDynamicRouting.
 */
export interface GetAiGatewayDynamicRoutingOutputArgs {
    accountId?: pulumi.Input<string | undefined>;
    gatewayId: pulumi.Input<string>;
    /**
     * The ID of this resource.
     */
    id: pulumi.Input<string>;
}
//# sourceMappingURL=getAiGatewayDynamicRouting.d.ts.map