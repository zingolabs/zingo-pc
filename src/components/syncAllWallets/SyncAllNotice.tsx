import React from "react";

/**
 * What "sync all wallets" is about to do, for the confirmation that starts it.
 *
 * Left-aligned and broken at words: the dialog it sits in centres its body and
 * breaks anywhere, which suits the one-line questions and addresses it usually
 * holds and not two paragraphs.
 */
const SyncAllNotice: React.FC = () => (
  <div style={{ textAlign: "left", wordBreak: "normal", lineHeight: 1.5 }}>
    <p style={{ marginTop: 0 }}>
      Every wallet is synced to the chain tip, one after another: Mainnet first, then Testnet, then Regtest. It happens
      in the background, so you can keep using the app. The dashboard shows how it is going.
    </p>
    <p style={{ marginBottom: 0 }}>
      The wallet you have open is left to its own sync. Sending and shielding take longer while this runs, and the
      computer is kept awake until it finishes. You can cancel at any moment: what has been scanned is kept.
    </p>
  </div>
);

export default SyncAllNotice;
