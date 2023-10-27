import { Server } from "../components/appstate";

const serverUris = (): Server[] => {
  return [
    {
      uri: 'https://mainnet.lightwalletd.com:9067',
      region: 'North America',
      chain_name: 'main',
      latency: null,
    },
    //{
    //  uri: 'https://lwdv3.zecwallet.co:443',
    //  region: 'North America',
    //  chain_name: 'main',
    //  latency: null,
    //},
    {
      uri: 'https://na.lightwalletd.com:443',
      region: 'North America',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://sa.lightwalletd.com:443',
      region: 'South America',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://eu.lightwalletd.com:443',
      region: 'Europe & Africa',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://ai.lightwalletd.com:443',
      region: 'Asia & Oceania',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://lwd1.zcash-infra.com:9067',
      region: 'East Europe',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://lwd2.zcash-infra.com:9067',
      region: 'Hong Kong',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://lwd3.zcash-infra.com:9067',
      region: 'USA',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://lwd4.zcash-infra.com:9067',
      region: 'Canada',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://lwd5.zcash-infra.com:9067',
      region: '-',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://lwd6.zcash-infra.com:9067',
      region: '-',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://lwd7.zcash-infra.com:9067',
      region: '-',
      chain_name: 'main',
      latency: null,
    },
    {
      uri: 'https://lwd8.zcash-infra.com:9067',
      region: '-',
      chain_name: 'main',
      latency: null,
    },
  ];
};

export default serverUris;
