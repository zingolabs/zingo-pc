export default class RPCConfig {
    url: string;
    chain_name: 'main' | 'test' | 'regtest' | "";
  
    constructor() {
      this.url = "";
      this.chain_name = "";
    }
  }
  