import ToAddr from "./ToAddr";

export default class SendPageState {
    fromaddr: string;
    toaddrs: ToAddr[];
  
    constructor() {
      this.fromaddr = "";
      this.toaddrs = [];
    }
  }
