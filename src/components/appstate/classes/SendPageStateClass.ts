import ToAddrClass from "./ToAddrClass";

/**
 * Recipients one send may carry before the screen asks for some to be removed.
 *
 * Soft rather than hard: no row is ever dropped to honour it. A payment request
 * naming more still loads whole, and the screen says how many to take out.
 * Every output raises the ZIP 317 fee and lengthens the proof, and past a
 * handful a batch is easier to get wrong than to check.
 */
export const MAX_RECIPIENTS: number = 10;

export default class SendPageStateClass {
  // Never empty, so the screen always has a row to type into.
  toaddrs: ToAddrClass[];

  constructor() {
    this.toaddrs = [new ToAddrClass()];
  }
}
