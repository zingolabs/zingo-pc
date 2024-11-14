import { ChainNameEnum } from "./ChainNameEnum";

export default class RPCConfig {
    url: string;
    chain_name: ChainNameEnum | "";
  
    constructor() {
      this.url = "";
      this.chain_name = "";
    }
  }
  