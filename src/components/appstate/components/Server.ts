export default class Server {
  uri: string;
  region: string;
  chain_name: 'main' | 'test' | 'regtest';
  latency: number | null;

  constructor(uri: string, region: string, chain_name: 'main' | 'test' | 'regtest') {
    this.uri = uri;
    this.region = region;
    this.chain_name = chain_name;
    this.latency = null;
  }
}
