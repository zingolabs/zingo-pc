import ToAddr from "./ToAddrClass";

export default class SendPageStateClass {
    fromaddr: string;
    toaddrs: ToAddr[];
  
    constructor() {
      this.fromaddr = "";
      this.toaddrs = [];
    }
  }
