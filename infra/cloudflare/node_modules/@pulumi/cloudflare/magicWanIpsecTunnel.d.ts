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
 * const exampleMagicWanIpsecTunnel = new cloudflare.MagicWanIpsecTunnel("example_magic_wan_ipsec_tunnel", {
 *     accountId: "023e105f4ecef8ad9ca31a8372d0c353",
 *     cloudflareEndpoint: "203.0.113.1",
 *     interfaceAddress: "192.0.2.0/31",
 *     name: "IPsec_1",
 *     automaticReturnRouting: true,
 *     bgp: {
 *         customerAsn: 0,
 *         extraPrefixes: ["string"],
 *         md5Key: "md5_key",
 *     },
 *     customRemoteIdentities: {
 *         fqdnId: "fqdn_id",
 *     },
 *     customerEndpoint: "203.0.113.1",
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
 *     psk: "O3bwKSjnaoCxDoUxjcq4Rk8ZKkezQUiy",
 *     replayProtection: false,
 * });
 * ```
 *
 * ## Import
 *
 * ```sh
 * $ pulumi import cloudflare:index/magicWanIpsecTunnel:MagicWanIpsecTunnel example '<account_id>/<ipsec_tunnel_id>'
 * ```
 */
export declare class MagicWanIpsecTunnel extends pulumi.CustomResource {
    /**
     * Get an existing MagicWanIpsecTunnel resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: MagicWanIpsecTunnelState, opts?: pulumi.CustomResourceOptions): MagicWanIpsecTunnel;
    /**
     * Returns true if the given object is an instance of MagicWanIpsecTunnel.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is MagicWanIpsecTunnel;
    /**
     * Identifier
     */
    readonly accountId: pulumi.Output<string>;
    /**
     * When `true`, the tunnel can use a null-cipher (`ENCR_NULL`) in the ESP tunnel (Phase 2).
     */
    readonly allowNullCipher: pulumi.Output<boolean>;
    /**
     * True if automatic stateful return routing should be enabled for a tunnel, false otherwise.
     */
    readonly automaticReturnRouting: pulumi.Output<boolean>;
    readonly bgp: pulumi.Output<outputs.MagicWanIpsecTunnelBgp | undefined>;
    readonly bgpStatus: pulumi.Output<outputs.MagicWanIpsecTunnelBgpStatus>;
    /**
     * The IP address assigned to the Cloudflare side of the IPsec tunnel.
     */
    readonly cloudflareEndpoint: pulumi.Output<string>;
    /**
     * The date and time the tunnel was created.
     */
    readonly createdOn: pulumi.Output<string>;
    readonly customRemoteIdentities: pulumi.Output<outputs.MagicWanIpsecTunnelCustomRemoteIdentities | undefined>;
    /**
     * The IP address assigned to the customer side of the IPsec tunnel. Not required, but must be set for proactive traceroutes to work.
     */
    readonly customerEndpoint: pulumi.Output<string | undefined>;
    /**
     * An optional description forthe IPsec tunnel.
     */
    readonly description: pulumi.Output<string>;
    readonly healthCheck: pulumi.Output<outputs.MagicWanIpsecTunnelHealthCheck>;
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
     * The name of the IPsec tunnel. The name cannot share a name with other tunnels.
     */
    readonly name: pulumi.Output<string>;
    /**
     * A randomly generated or provided string for use in the IPsec tunnel.
     */
    readonly psk: pulumi.Output<string | undefined>;
    /**
     * The PSK metadata that includes when the PSK was generated.
     */
    readonly pskMetadata: pulumi.Output<outputs.MagicWanIpsecTunnelPskMetadata>;
    /**
     * If `true`, then IPsec replay protection will be supported in the Cloudflare-to-customer direction.
     */
    readonly replayProtection: pulumi.Output<boolean>;
    /**
     * Create a MagicWanIpsecTunnel resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: MagicWanIpsecTunnelArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering MagicWanIpsecTunnel resources.
 */
export interface MagicWanIpsecTunnelState {
    /**
     * Identifier
     */
    accountId?: pulumi.Input<string | undefined>;
    /**
     * When `true`, the tunnel can use a null-cipher (`ENCR_NULL`) in the ESP tunnel (Phase 2).
     */
    allowNullCipher?: pulumi.Input<boolean | undefined>;
    /**
     * True if automatic stateful return routing should be enabled for a tunnel, false otherwise.
     */
    automaticReturnRouting?: pulumi.Input<boolean | undefined>;
    bgp?: pulumi.Input<inputs.MagicWanIpsecTunnelBgp | undefined>;
    bgpStatus?: pulumi.Input<inputs.MagicWanIpsecTunnelBgpStatus | undefined>;
    /**
     * The IP address assigned to the Cloudflare side of the IPsec tunnel.
     */
    cloudflareEndpoint?: pulumi.Input<string | undefined>;
    /**
     * The date and time the tunnel was created.
     */
    createdOn?: pulumi.Input<string | undefined>;
    customRemoteIdentities?: pulumi.Input<inputs.MagicWanIpsecTunnelCustomRemoteIdentities | undefined>;
    /**
     * The IP address assigned to the customer side of the IPsec tunnel. Not required, but must be set for proactive traceroutes to work.
     */
    customerEndpoint?: pulumi.Input<string | undefined>;
    /**
     * An optional description forthe IPsec tunnel.
     */
    description?: pulumi.Input<string | undefined>;
    healthCheck?: pulumi.Input<inputs.MagicWanIpsecTunnelHealthCheck | undefined>;
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
     * The name of the IPsec tunnel. The name cannot share a name with other tunnels.
     */
    name?: pulumi.Input<string | undefined>;
    /**
     * A randomly generated or provided string for use in the IPsec tunnel.
     */
    psk?: pulumi.Input<string | undefined>;
    /**
     * The PSK metadata that includes when the PSK was generated.
     */
    pskMetadata?: pulumi.Input<inputs.MagicWanIpsecTunnelPskMetadata | undefined>;
    /**
     * If `true`, then IPsec replay protection will be supported in the Cloudflare-to-customer direction.
     */
    replayProtection?: pulumi.Input<boolean | undefined>;
}
/**
 * The set of arguments for constructing a MagicWanIpsecTunnel resource.
 */
export interface MagicWanIpsecTunnelArgs {
    /**
     * Identifier
     */
    accountId: pulumi.Input<string>;
    /**
     * True if automatic stateful return routing should be enabled for a tunnel, false otherwise.
     */
    automaticReturnRouting?: pulumi.Input<boolean | undefined>;
    bgp?: pulumi.Input<inputs.MagicWanIpsecTunnelBgp | undefined>;
    /**
     * The IP address assigned to the Cloudflare side of the IPsec tunnel.
     */
    cloudflareEndpoint: pulumi.Input<string>;
    customRemoteIdentities?: pulumi.Input<inputs.MagicWanIpsecTunnelCustomRemoteIdentities | undefined>;
    /**
     * The IP address assigned to the customer side of the IPsec tunnel. Not required, but must be set for proactive traceroutes to work.
     */
    customerEndpoint?: pulumi.Input<string | undefined>;
    /**
     * An optional description forthe IPsec tunnel.
     */
    description?: pulumi.Input<string | undefined>;
    healthCheck?: pulumi.Input<inputs.MagicWanIpsecTunnelHealthCheck | undefined>;
    /**
     * A 31-bit prefix (/31 in CIDR notation) supporting two hosts, one for each side of the tunnel. Select the subnet from the following private IP space: 10.0.0.0–10.255.255.255, 172.16.0.0–172.31.255.255, 192.168.0.0–192.168.255.255.
     */
    interfaceAddress: pulumi.Input<string>;
    /**
     * A 127 bit IPV6 prefix from within the virtual*subnet6 prefix space with the address being the first IP of the subnet and not same as the address of virtual*subnet6. Eg if virtual*subnet6 is 2606:54c1:7:0:a9fe:12d2::/127 , interface*address6 could be 2606:54c1:7:0:a9fe:12d2:1:200/127
     */
    interfaceAddress6?: pulumi.Input<string | undefined>;
    /**
     * The name of the IPsec tunnel. The name cannot share a name with other tunnels.
     */
    name: pulumi.Input<string>;
    /**
     * A randomly generated or provided string for use in the IPsec tunnel.
     */
    psk?: pulumi.Input<string | undefined>;
    /**
     * If `true`, then IPsec replay protection will be supported in the Cloudflare-to-customer direction.
     */
    replayProtection?: pulumi.Input<boolean | undefined>;
}
//# sourceMappingURL=magicWanIpsecTunnel.d.ts.map