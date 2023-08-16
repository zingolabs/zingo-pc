export default class RPCConfig {
    url: string;
    chain: 'main' | 'test' | 'regtest' | "";
  
    constructor() {
      this.url = "";
      this.chain = "";
    }
  }
  