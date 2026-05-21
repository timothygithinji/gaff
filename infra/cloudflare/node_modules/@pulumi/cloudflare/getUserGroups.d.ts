import * as pulumi from "@pulumi/pulumi";
import * as outputs from "./types/output";
/**
 * Accepted Permissions
 *
 * - `Account Settings Read`
 * - `Account Settings Write`
 * - `SCIM Provisioning`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleUserGroups = cloudflare.getUserGroups({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     id: "023e105f4ecef8ad9ca31a8372d0c353",
 *     fuzzyName: "Foo",
 *     name: "NameOfTheUserGroup",
 * });
 * ```
 */
export declare function getUserGroups(args: GetUserGroupsArgs, opts?: pulumi.InvokeOptions): Promise<GetUserGroupsResult>;
/**
 * A collection of arguments for invoking getUserGroups.
 */
export interface GetUserGroupsArgs {
    /**
     * Account identifier tag.
     */
    accountId: string;
    /**
     * The sort order of returned user groups by name (ascending or descending).
     * Available values: "asc", "desc".
     */
    direction?: string;
    /**
     * A string used for searching for user groups containing that substring.
     */
    fuzzyName?: string;
    /**
     * ID of the user group to be fetched.
     */
    id?: string;
    /**
     * Max items to fetch, default: 1000
     */
    maxItems?: number;
    /**
     * Name of the user group to be fetched.
     */
    name?: string;
}
/**
 * A collection of values returned by getUserGroups.
 */
export interface GetUserGroupsResult {
    /**
     * Account identifier tag.
     */
    readonly accountId: string;
    /**
     * The sort order of returned user groups by name (ascending or descending).
     * Available values: "asc", "desc".
     */
    readonly direction: string;
    /**
     * A string used for searching for user groups containing that substring.
     */
    readonly fuzzyName?: string;
    /**
     * ID of the user group to be fetched.
     */
    readonly id?: string;
    /**
     * Max items to fetch, default: 1000
     */
    readonly maxItems?: number;
    /**
     * Name of the user group to be fetched.
     */
    readonly name?: string;
    /**
     * The items returned by the data source
     */
    readonly results: outputs.GetUserGroupsResult[];
}
/**
 * Accepted Permissions
 *
 * - `Account Settings Read`
 * - `Account Settings Write`
 * - `SCIM Provisioning`
 *
 * ## Example Usage
 *
 * ```typescript
 * import * as pulumi from "@pulumi/pulumi";
 * import * as cloudflare from "@pulumi/cloudflare";
 *
 * const exampleUserGroups = cloudflare.getUserGroups({
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     id: "023e105f4ecef8ad9ca31a8372d0c353",
 *     fuzzyName: "Foo",
 *     name: "NameOfTheUserGroup",
 * });
 * ```
 */
export declare function getUserGroupsOutput(args: GetUserGroupsOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetUserGroupsResult>;
/**
 * A collection of arguments for invoking getUserGroups.
 */
export interface GetUserGroupsOutputArgs {
    /**
     * Account identifier tag.
     */
    accountId: pulumi.Input<string>;
    /**
     * The sort order of returned user groups by name (ascending or descending).
     * Available values: "asc", "desc".
     */
    direction?: pulumi.Input<string | undefined>;
    /**
     * A string used for searching for user groups containing that substring.
     */
    fuzzyName?: pulumi.Input<string | undefined>;
    /**
     * ID of the user group to be fetched.
     */
    id?: pulumi.Input<string | undefined>;
    /**
     * Max items to fetch, default: 1000
     */
    maxItems?: pulumi.Input<number | undefined>;
    /**
     * Name of the user group to be fetched.
     */
    name?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getUserGroups.d.ts.map