import { ServerClass } from "../components/appstate";
import { ServerChainNameEnum } from "../components/appstate";

const serverUrisList = (): ServerClass[] => {
  return [
    // default servers (2)
    {
      uri: "https://zec.rocks:443", // this will be the default server in MainNet.
      chain_name: ServerChainNameEnum.mainChainName,
      default: true,
      latency: null,
      obsolete: false,
    },
    {
      uri: "https://testnet.zec.rocks:443", // this will be the default server in Testnet.
      chain_name: ServerChainNameEnum.testChainName,
      default: true,
      latency: null,
      obsolete: false,
    },
    // new servers (not default) (5)
    {
      uri: "https://na.zec.rocks:443",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: false,
    },
    {
      uri: "https://sa.zec.rocks:443",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: false,
    },
    {
      uri: "https://eu.zec.rocks:443",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: false,
    },
    {
      uri: "https://ap.zec.rocks:443",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: false,
    },
    {
      uri: "https://zcash.mysideoftheweb.com:19067",
      chain_name: ServerChainNameEnum.testChainName,
      default: false,
      latency: null,
      obsolete: false,
    },
    // obsolete servers (13)
    // this was a typo in the previous version.
    {
      uri: "zcash.mysideoftheweb.com:19067",
      chain_name: ServerChainNameEnum.testChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://lwd1.zcash-infra.com:9067",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://lwd2.zcash-infra.com:9067",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://lwd3.zcash-infra.com:9067",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://lwd4.zcash-infra.com:9067",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://lwd5.zcash-infra.com:9067",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://lwd6.zcash-infra.com:9067",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://lwd7.zcash-infra.com:9067",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://lwd8.zcash-infra.com:9067",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://mainnet.lightwalletd.com:9067",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://na.lightwalletd.com:443",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://sa.lightwalletd.com:443",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://eu.lightwalletd.com:443",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
    {
      uri: "https://ai.lightwalletd.com:443",
      chain_name: ServerChainNameEnum.mainChainName,
      default: false,
      latency: null,
      obsolete: true,
    },
  ];
};

export default serverUrisList;
