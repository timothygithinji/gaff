import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `SSO Connector Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleSsoConnector = cloudflare.getSsoConnector({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     ssoConnectorId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getSsoConnector(args: GetSsoConnectorArgs, opts?: pulumi.InvokeOptions): Promise<GetSsoConnectorResult>;
/**
 * A collection of arguments for invoking getSsoConnector.
 */
export interface GetSsoConnectorArgs {
    /**
     * Account identifier tag.
     */
    accountId?: string;
    /**
     * SSO Connector identifier tag.
     */
    ssoConnectorId: string;
}
/**
 * A collection of values returned by getSsoConnector.
 */
export interface GetSsoConnectorResult {
    /**
     * Account identifier tag.
     */
    readonly accountId?: string;
    /**
     * Timestamp for the creation of the SSO connector
     */
    readonly createdOn: string;
    readonly emailDomain: string;
    readonly enabled: boolean;
    /**
     * SSO Connector identifier tag.
     */
    readonly id: string;
    /**
     * SSO Connector identifier tag.
     */
    readonly ssoConnectorId: string;
    /**
     * Timestamp for the last update of the SSO connector
     */
    readonly updatedOn: string;
    /**
     * Controls the display of FedRAMP language to the user during SSO login
     */
    readonly useFedrampLanguage: boolean;
    readonly verification: outputs.GetSsoConnectorVerification;
}
/**
 * Accepted Permissions
 *
 * - `SSO Connector Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleSsoConnector = cloudflare.getSsoConnector({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     ssoConnectorId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getSsoConnectorOutput(args: GetSsoConnectorOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetSsoConnectorResult>;
/**
 * A collection of arguments for invoking getSsoConnector.
 */
export interface GetSsoConnectorOutputArgs {
    /**
     * Account identifier tag.
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * SSO Connector identifier tag.
     */
    ssoConnectorId: pulumi.Input<string>;
}
//# sourceMappingURL=getSsoConnector.d.ts.map