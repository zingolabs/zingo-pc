export type SendJsonToTypeType = {
  address: string;
  amount: number;
  memo?: string;
  /**
   * Hex-encoded payload for a transparent OP_RETURN output.
   *
   * One OP_RETURN exists per transaction, not per receiver, so the Rust side
   * reads this from the first entry alone and applies it to the whole
   * proposal. The array shape is the JSON contract's, not this field's. Used
   * by the swap deposit flow for Maya and THORChain memos; ordinary sends
   * omit it.
   */
  op_return?: string;
  /**
   * Forces a transparent recipient through the ZIP 320 ephemeral hop
   * (shielded → wallet ephemeral t-addr → recipient).
   *
   * Transaction-wide like `op_return`, and read from the first entry for the
   * same reason. Mayachain and THORChain derive a swap's refund destination
   * from the inbound transaction's origin, which a shielded spend does not
   * expose, so their deposits need an origin the wallet controls.
   */
  route_via_ephemeral?: boolean;
};
