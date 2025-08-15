import { ServerChainNameEnum } from "../enums/ServerChainNameEnum";

export default class ServerClass {
  uri: string;
  region: string;
  chain_name: ServerChainNameEnum;
  latency: number | null;
  default: boolean;
  obsolete: boolean;

  constructor(uri: string, region: string, chain_name: ServerChainNameEnum) {
    this.uri = uri;
    this.region = region;
    this.chain_name = chain_name;
    this.latency = null;
    this.default = false;
    this.obsolete = false;
  }
}
