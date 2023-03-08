import { ToAddr } from "./ToAddr";

export class SendPageState {
    fromaddr: string;
  
    toaddrs: ToAddr[];
  
    constructor() {
      this.fromaddr = "";
      this.toaddrs = [];
    }
  }
