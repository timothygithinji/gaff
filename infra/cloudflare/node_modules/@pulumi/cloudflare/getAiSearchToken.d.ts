import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare function getAiSearchToken(args?: GetAiSearchTokenArgs, opts?: pulumi.InvokeOptions): Promise<GetAiSearchTokenResult>;
/**
 * A collection of arguments for invoking getAiSearchToken.
 */
export interface GetAiSearchTokenArgs {
    accountId?: string;
    filter?: inputs.GetAiSearchTokenFilter;
    /**
     * The ID of this resource.
     */
    id?: string;
}
/**
 * A collection of values returned by getAiSearchToken.
 */
export interface GetAiSearchTokenResult {
    readonly accountId?: string;
    readonly cfApiId: string;
    readonly createdAt: string;
    readonly createdBy: string;
    readonly enabled: boolean;
    readonly filter?: outputs.GetAiSearchTokenFilter;
    /**
     * The ID of this resource.
     */
    readonly id: string;
    readonly legacy: boolean;
    readonly modifiedAt: string;
    readonly modifiedBy: string;
    readonly name: string;
}
export declare function getAiSearchTokenOutput(args?: GetAiSearchTokenOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetAiSearchTokenResult>;
/**
 * A collection of arguments for invoking getAiSearchToken.
 */
export interface GetAiSearchTokenOutputArgs {
    accountId?: pulumi.Input<string | undefined>;
    filter?: pulumi.Input<inputs.GetAiSearchTokenFilterArgs | undefined>;
    /**
     * The ID of this resource.
     */
    id?: pulumi.Input<string | undefined>;
}
//# sourceMappingURL=getAiSearchToken.d.ts.map