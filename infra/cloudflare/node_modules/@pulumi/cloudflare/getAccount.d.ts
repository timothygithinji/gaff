import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Account Firewall Access Rules Read`
 * - `Account Firewall Access Rules Write`
 * - `Account Settings Read`
 * - `Account Settings Write`
 * - `Billing Read`
 * - `Billing Write`
 * - `DDoS Botnet Feed Read`
 * - `DDoS Botnet Feed Write`
 * - `DDoS Protection Read`
 * - `DDoS Protection Write`
 * - `DNS Firewall Read`
 * - `DNS Firewall Write`
 * - `DNS View Read`
 * - `DNS View Write`
 * - `Load Balancers Account Read`
 * - `Load Balancers Account Write`
 * - `Load Balancing: Monitors and Pools Read`
 * - `Load Balancing: Monitors and Pools Write`
 * - `SCIM Provisioning`
 * - `Trust and Safety Read`
 * - `Trust and Safety Write`
 * - `Workers KV Storage Read`
 * - `Workers KV Storage Write`
 * - `Workers R2 Storage Read`
 * - `Workers R2 Storage Write`
 * - `Workers Scripts Read`
 * - `Workers Scripts Write`
 * - `Workers Tail Read`
 * - `Zero Trust: PII Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleAccount = cloudflare.getAccount({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getAccount(args?: GetAccountArgs, opts?: pulumi.InvokeOptions): Promise<GetAccountResult>;
/**
 * A collection of arguments for invoking getAccount.
 */
export interface GetAccountArgs {
    /**
     * Account identifier tag.
     */
    accountId?: string;
    filter?: inputs.GetAccountFilter;
}
/**
 * A collection of values returned by getAccount.
 */
export interface GetAccountResult {
    /**
     * Account identifier tag.
     */
    readonly accountId?: string;
    /**
     * Timestamp for the creation of the account
     */
    readonly createdOn: string;
    readonly filter?: outputs.GetAccountFilter;
    /**
     * Account identifier tag.
     */
    readonly id: string;
    /**
     * Parent container details
     */
    readonly managedBy: outputs.GetAccountManagedBy;
    /**
     * Account name
     */
    readonly name: string;
    /**
     * Account settings
     */
    readonly settings: outputs.GetAccountSettings;
    /**
     * Available values: "standard", "enterprise".
     */
    readonly type: string;
}
/**
 * Accepted Permissions
 *
 * - `Account Firewall Access Rules Read`
 * - `Account Firewall Access Rules Write`
 * - `Account Settings Read`
 * - `Account Settings Write`
 * - `Billing Read`
 * - `Billing Write`
 * - `DDoS Botnet Feed Read`
 * - `DDoS Botnet Feed Write`
 * - `DDoS Protection Read`
 * - `DDoS Protection Write`
 * - `DNS Firewall Read`
 * - `DNS Firewall Write`
 * - `DNS View Read`
 * - `DNS View Write`
 * - `Load Balancers Account Read`
 * - `Load Balancers Account Write`
 * - `Load Balancing: Monitors and Pools Read`
 * - `Load Balancing: Monitors and Pools Write`
 * - `SCIM Provisioning`
 * - `Trust and Safety Read`
 * - `Trust and Safety Write`
 * - `Workers KV Storage Read`
 * - `Workers KV Storage Write`
 * - `Workers R2 Storage Read`
 * - `Workers R2 Storage Write`
 * - `Workers Scripts Read`
 * - `Workers Scripts Write`
 * - `Workers Tail Read`
 * - `Zero Trust: PII Read`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleAccount = cloudflare.getAccount({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 * });
 * ```
 */
export declare function getAccountOutput(args?: GetAccountOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetAccountResult>;
/**
 * A collection of arguments for invoking getAccount.
 */
export interface GetAccountOutputArgs {
    /**
     * Account identifier tag.
     */
    accountId?: pulumi.Input<string | undefined>;
    filter?: pulumi.Input<inputs.GetAccountFilterArgs | undefined>;
}
//# sourceMappingURL=getAccount.d.ts.map