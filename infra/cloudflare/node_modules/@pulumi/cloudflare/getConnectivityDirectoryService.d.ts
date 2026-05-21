import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
/**
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleConnectivityDirectoryService = cloudflare.getConnectivityDirectoryService({
 *     accountId: "account_id",
 *     serviceId: "182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e",
 * });
 * ```
 */
export declare function getConnectivityDirectoryService(args?: GetConnectivityDirectoryServiceArgs, opts?: pulumi.InvokeOptions): Promise<GetConnectivityDirectoryServiceResult>;
/**
 * A collection of arguments for invoking getConnectivityDirectoryService.
 */
export interface GetConnectivityDirectoryServiceArgs {
    accountId?: string;
    filter?: inputs.GetConnectivityDirectoryServiceFilter;
    serviceId?: string;
}
/**
 * A collection of values returned by getConnectivityDirectoryService.
 */
export interface GetConnectivityDirectoryServiceResult {
    readonly accountId?: string;
    /**
     * Available values: "postgresql", "mysql".
     */
    readonly appProtocol: string;
    readonly createdAt: string;
    readonly filter?: outputs.GetConnectivityDirectoryServiceFilter;
    readonly host: outputs.GetConnectivityDirectoryServiceHost;
    readonly httpPort: number;
    readonly httpsPort: number;
    /**
     * The ID of this resource.
     */
    readonly id: string;
    readonly name: string;
    readonly serviceId: string;
    readonly tcpPort: number;
    /**
     * TLS settings for a connectivity service.
     */
    readonly tlsSettings: outputs.GetConnectivityDirectoryServiceTlsSettings;
    readonly type: string;
    readonly updatedAt: string;
}
/**
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleConnectivityDirectoryService = cloudflare.getConnectivityDirectoryService({
 *     accountId: "account_id",
 *     serviceId: "182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e",
 * });
 * ```
 */
export declare function getConnectivityDirectoryServiceOutput(args?: GetConnectivityDirectoryServiceOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetConnectivityDirectoryServiceResult>;
/**
 * A collection of arguments for invoking getConnectivityDirectoryService.
 */
export interface GetConnectivityDirectoryServiceOutputArgs {
    accountId?: pulumi.Input<string | undefined>;
    filter?: pulumi.Input<inputs.GetConnectivityDirectoryServiceFilterArgs | undefined>;
    serviceId?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getConnectivityDirectoryService.d.ts.map