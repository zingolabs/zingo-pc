import { ChainNameEnum } from "./ChainNameEnum";

export default class Server {
  uri: string;
  region: string;
  chain_name: ChainNameEnum;
  latency: number | null;
  default: boolean;
  obsolete: boolean;

  constructor(uri: string, region: string, chain_name: ChainNameEnum) {
    this.uri = uri;
    this.region = region;
    this.chain_name = chain_name;
    this.latency = null;
    this.default = false;
    this.obsolete = false;
  }
}
