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
 * const exampleMagicWanGreTunnel = new cloudflare.MagicWanGreTunnel("example_magic_wan_gre_tunnel", {
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     cloudflareGreEndpoint: "203.0.113.1",
 *     customerGreEndpoint: "203.0.113.1",
 *     interfaceAddress: "192.0.2.0/31",
 *     name: "GRE_1",
 *     automaticReturnRouting: true,
 *     bgp: {
 *         customerAsn: 0,
 *         extraPrefixes: ["string"],
 *         md5Key: "md5_key",
 *     },
 *     description: "Tunnel for ISP X",
 *     healthCheck: {
 *         direction: "bidirectional",
 *         enabled: true,
 *         rate: "low",
 *         target: {
 *             saved: "203.0.113.1",
 *         },
 *         type: "request",
 *     },
 *     interfaceAddress6: "2606:54c1:7:0:a9fe:12d2:1:200/127",
 *     mtu: 0,
 *     ttl: 0,
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/magicWanGreTunnel:MagicWanGreTunnel example '<account_id>/<gre_tunnel_id>'
 * ```
 */
export declare class MagicWanGreTunnel extends pulumi.CustomResource {
    /**
     * Get an existing MagicWanGreTunnel resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: MagicWanGreTunnelState, opts?: pulumi.CustomResourceOptions): MagicWanGreTunnel;
    /**
     * Returns true if the given object is an instance of MagicWanGreTunnel.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is MagicWanGreTunnel;
    /**
     * Identifier
     */
    readonly accountId: pulumi.Output<string>;
    /**
     * True if automatic stateful return routing should be enabled for a tunnel, false otherwise.
     */
    readonly automaticReturnRouting: pulumi.Output<boolean>;
    readonly bgp: pulumi.Output<outputs.MagicWanGreTunnelBgp | undefined>;
    readonly bgpStatus: pulumi.Output<outputs.MagicWanGreTunnelBgpStatus>;
    /**
     * The IP address assigned to the Cloudflare side of the GRE tunnel.
     */
    readonly cloudflareGreEndpoint: pulumi.Output<string>;
    /**
     * The date and time the tunnel was created.
     */
    readonly createdOn: pulumi.Output<string>;
    /**
     * The IP address assigned to the customer side of the GRE tunnel.
     */
    readonly customerGreEndpoint: pulumi.Output<string>;
    /**
     * An optional description of the GRE tunnel.
     */
    readonly description: pulumi.Output<string>;
    readonly healthCheck: pulumi.Output<outputs.MagicWanGreTunnelHealthCheck>;
    /**
     * A 31-bit prefix (/31 in CIDR notation) supporting two hosts, one for each side of the tunnel. Select the subnet from the following private IP space: 10.0.0.0–10.255.255.255, 172.16.0.0–172.31.255.255, 192.168.0.0–192.168.255.255.
     */
    readonly interfaceAddress: pulumi.Output<string>;
    /**
     * A 127 bit IPV6 prefix from within the virtual*subnet6 prefix space with the address being the first IP of the subnet and not same as the address of virtual*subnet6. Eg if virtual*subnet6 is 2606:54c1:7:0:a9fe:12d2::/127 , interface*address6 could be 2606:54c1:7:0:a9fe:12d2:1:200/127
     */
    readonly interfaceAddress6: pulumi.Output<string | undefined>;
    /**
     * The date and time the tunnel was last modified.
     */
    readonly modifiedOn: pulumi.Output<string>;
    /**
     * Maximum Transmission Unit (MTU) in bytes for the GRE tunnel. The minimum value is 576.
     */
    readonly mtu: pulumi.Output<number>;
    /**
     * The name of the tunnel. The name cannot contain spaces or special characters, must be 15 characters or less, and cannot share a name with another GRE tunnel.
     */
    readonly name: pulumi.Output<string>;
    /**
     * Time To Live (TTL) in number of hops of the GRE tunnel.
     */
    readonly ttl: pulumi.Output<number>;
    /**
     * Create a MagicWanGreTunnel resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: MagicWanGreTunnelArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering MagicWanGreTunnel resources.
 */
export interface MagicWanGreTunnelState {
    /**
     * Identifier
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * True if automatic stateful return routing should be enabled for a tunnel, false otherwise.
     */
    automaticReturnRouting?: pulumi.Input<boolean | undefined>;
    bgp?: pulumi.Input<inputs.MagicWanGreTunnelBgp | undefined>;
    bgpStatus?: pulumi.Input<inputs.MagicWanGreTunnelBgpStatus | undefined>;
    /**
     * The IP address assigned to the Cloudflare side of the GRE tunnel.
     */
    cloudflareGreEndpoint?: pulumi.Input<string | undefined>;
    /**
     * The date and time the tunnel was created.
     */
    createdOn?: pulumi.Input<string | undefined>;
    /**
     * The IP address assigned to the customer side of the GRE tunnel.
     */
    customerGreEndpoint?: pulumi.Input<string | undefined>;
    /**
     * An optional description of the GRE tunnel.
     */
    description?: pulumi.Input<string | undefined>;
    healthCheck?: pulumi.Input<inputs.MagicWanGreTunnelHealthCheck | undefined>;
    /**
     * A 31-bit prefix (/31 in CIDR notation) supporting two hosts, one for each side of the tunnel. Select the subnet from the following private IP space: 10.0.0.0–10.255.255.255, 172.16.0.0–172.31.255.255, 192.168.0.0–192.168.255.255.
     */
    interfaceAddress?: pulumi.Input<string | undefined>;
    /**
     * A 127 bit IPV6 prefix from within the virtual*subnet6 prefix space with the address being the first IP of the subnet and not same as the address of virtual*subnet6. Eg if virtual*subnet6 is 2606:54c1:7:0:a9fe:12d2::/127 , interface*address6 could be 2606:54c1:7:0:a9fe:12d2:1:200/127
     */
    interfaceAddress6?: pulumi.Input<string | undefined>;
    /**
     * The date and time the tunnel was last modified.
     */
    modifiedOn?: pulumi.Input<string | undefined>;
    /**
     * Maximum Transmission Unit (MTU) in bytes for the GRE tunnel. The minimum value is 576.
     */
    mtu?: pulumi.Input<number | undefined>;
    /**
     * The name of the tunnel. The name cannot contain spaces or special characters, must be 15 characters or less, and cannot share a name with another GRE tunnel.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * Time To Live (TTL) in number of hops of the GRE tunnel.
     */
    ttl?: pulumi.Input<number | undefined>;
}
/**
 * The set of arguments for constructing a MagicWanGreTunnel resource.
 */
export interface MagicWanGreTunnelArgs {
    /**
     * Identifier
     */
    accountId: pulumi.Input<string>;
    /**
     * True if automatic stateful return routing should be enabled for a tunnel, false otherwise.
     */
    automaticReturnRouting?: pulumi.Input<boolean | undefined>;
    bgp?: pulumi.Input<inputs.MagicWanGreTunnelBgp | undefined>;
    /**
     * The IP address assigned to the Cloudflare side of the GRE tunnel.
     */
    cloudflareGreEndpoint: pulumi.Input<string>;
    /**
     * The IP address assigned to the customer side of the GRE tunnel.
     */
    customerGreEndpoint: pulumi.Input<string>;
    /**
     * An optional description of the GRE tunnel.
     */
    description?: pulumi.Input<string | undefined>;
    healthCheck?: pulumi.Input<inputs.MagicWanGreTunnelHealthCheck | undefined>;
    /**
     * A 31-bit prefix (/31 in CIDR notation) supporting two hosts, one for each side of the tunnel. Select the subnet from the following private IP space: 10.0.0.0–10.255.255.255, 172.16.0.0–172.31.255.255, 192.168.0.0–192.168.255.255.
     */
    interfaceAddress: pulumi.Input<string>;
    /**
     * A 127 bit IPV6 prefix from within the virtual*subnet6 prefix space with the address being the first IP of the subnet and not same as the address of virtual*subnet6. Eg if virtual*subnet6 is 2606:54c1:7:0:a9fe:12d2::/127 , interface*address6 could be 2606:54c1:7:0:a9fe:12d2:1:200/127
     */
    interfaceAddress6?: pulumi.Input<string | undefined>;
    /**
     * Maximum Transmission Unit (MTU) in bytes for the GRE tunnel. The minimum value is 576.
     */
    mtu?: pulumi.Input<number | undefined>;
    /**
     * The name of the tunnel. The name cannot contain spaces or special characters, must be 15 characters or less, and cannot share a name with another GRE tunnel.
     */
    name: pulumi.Input<string>;
    /**
     * Time To Live (TTL) in number of hops of the GRE tunnel.
     */
    ttl?: pulumi.Input<number | undefined>;
}
//# sourceMappingURL=magicWanGreTunnel.d.ts.map