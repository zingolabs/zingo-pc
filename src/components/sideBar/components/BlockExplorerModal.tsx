import Modal from "react-modal";
import { useContext, useEffect, useState } from "react";
import cstyles from "../../common/Common.module.css";
import { BlockExplorerEnum } from "../../appstate";
import { ContextApp } from "../../../context/ContextAppState";
import ExplorerRow from "./ExplorerRow";

type BlockExplorerModalProps = {
  modalIsOpen: boolean;
  closeModal: () => void;
  modalTitle: string;
};

const normalizeCustom = (selected: BlockExplorerEnum, value: string) => {
  if (selected !== BlockExplorerEnum.Custom) return "";
  return value.endsWith("/") || value.endsWith("=") ? value : `${value}/`;
};

const BlockExplorerModal = ({ modalIsOpen, closeModal, modalTitle }: BlockExplorerModalProps) => {
  // Source of truth lives in context (kept in sync with electron-settings by
  // setBlockExplorer in Routes.tsx). Local draft state lets the user edit the
  // form without committing until they press Save.
  const {
    blockExplorerMainnetTransaction: ctxMainnetTransaction,
    blockExplorerTestnetTransaction: ctxTestnetTransaction,
    blockExplorerMainnetAddress: ctxMainnetAddress,
    blockExplorerTestnetAddress: ctxTestnetAddress,
    blockExplorerMainnetTransactionCustom: ctxMainnetTransactionCustom,
    blockExplorerTestnetTransactionCustom: ctxTestnetTransactionCustom,
    blockExplorerMainnetAddressCustom: ctxMainnetAddressCustom,
    blockExplorerTestnetAddressCustom: ctxTestnetAddressCustom,
    setBlockExplorer,
  } = useContext(ContextApp);

  const [blockExplorerMainnetTransaction, setBlockExplorerMainnetTransaction] =
    useState<BlockExplorerEnum>(ctxMainnetTransaction);
  const [blockExplorerTestnetTransaction, setBlockExplorerTestnetTransaction] =
    useState<BlockExplorerEnum>(ctxTestnetTransaction);
  const [blockExplorerMainnetAddress, setBlockExplorerMainnetAddress] = useState<BlockExplorerEnum>(ctxMainnetAddress);
  const [blockExplorerTestnetAddress, setBlockExplorerTestnetAddress] = useState<BlockExplorerEnum>(ctxTestnetAddress);
  const [blockExplorerMainnetTransactionCustom, setBlockExplorerMainnetTransactionCustom] =
    useState<string>(ctxMainnetTransactionCustom);
  const [blockExplorerTestnetTransactionCustom, setBlockExplorerTestnetTransactionCustom] =
    useState<string>(ctxTestnetTransactionCustom);
  const [blockExplorerMainnetAddressCustom, setBlockExplorerMainnetAddressCustom] =
    useState<string>(ctxMainnetAddressCustom);
  const [blockExplorerTestnetAddressCustom, setBlockExplorerTestnetAddressCustom] =
    useState<string>(ctxTestnetAddressCustom);

  // Re-sync the local draft with context every time the modal opens, so
  // reopening doesn't leak the previous session's edits if the user
  // cancelled (or the values were changed elsewhere).
  useEffect(() => {
    if (!modalIsOpen) return;
    setBlockExplorerMainnetTransaction(ctxMainnetTransaction);
    setBlockExplorerTestnetTransaction(ctxTestnetTransaction);
    setBlockExplorerMainnetAddress(ctxMainnetAddress);
    setBlockExplorerTestnetAddress(ctxTestnetAddress);
    setBlockExplorerMainnetTransactionCustom(ctxMainnetTransactionCustom);
    setBlockExplorerTestnetTransactionCustom(ctxTestnetTransactionCustom);
    setBlockExplorerMainnetAddressCustom(ctxMainnetAddressCustom);
    setBlockExplorerTestnetAddressCustom(ctxTestnetAddressCustom);
  }, [
    modalIsOpen,
    ctxMainnetTransaction,
    ctxTestnetTransaction,
    ctxMainnetAddress,
    ctxTestnetAddress,
    ctxMainnetTransactionCustom,
    ctxTestnetTransactionCustom,
    ctxMainnetAddressCustom,
    ctxTestnetAddressCustom,
  ]);

  const handleCancel = () => {
    // Just close — the next time the modal opens, the effect above re-syncs
    // the draft from context.
    closeModal();
  };

  const handleSave = () => {
    const toSave = {
      blockExplorerMainnetAddress,
      blockExplorerMainnetAddressCustom: normalizeCustom(
        blockExplorerMainnetAddress,
        blockExplorerMainnetAddressCustom,
      ),
      blockExplorerMainnetTransaction,
      blockExplorerMainnetTransactionCustom: normalizeCustom(
        blockExplorerMainnetTransaction,
        blockExplorerMainnetTransactionCustom,
      ),
      blockExplorerTestnetAddress,
      blockExplorerTestnetAddressCustom: normalizeCustom(
        blockExplorerTestnetAddress,
        blockExplorerTestnetAddressCustom,
      ),
      blockExplorerTestnetTransaction,
      blockExplorerTestnetTransactionCustom: normalizeCustom(
        blockExplorerTestnetTransaction,
        blockExplorerTestnetTransactionCustom,
      ),
    };
    setBlockExplorer(toSave);
    closeModal();
  };

  const saveDisabled =
    (blockExplorerMainnetAddress === BlockExplorerEnum.Custom && !blockExplorerMainnetAddressCustom) ||
    (blockExplorerMainnetTransaction === BlockExplorerEnum.Custom && !blockExplorerMainnetTransactionCustom) ||
    (blockExplorerTestnetAddress === BlockExplorerEnum.Custom && !blockExplorerTestnetAddressCustom) ||
    (blockExplorerTestnetTransaction === BlockExplorerEnum.Custom && !blockExplorerTestnetTransactionCustom);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modalOverlay}
      overlayClassName={cstyles.modalOverlay}
      style={{
        content: {
          background: "var(--bg-color, #1a1a2e)",
          border: "1px solid #444",
          borderRadius: 8,
          padding: 32,
          maxWidth: 640,
          margin: "auto",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          position: "absolute",
          right: "auto",
          bottom: "auto",
        },
      }}
    >
      <div className={`${cstyles.xlarge} ${cstyles.center}`}>{modalTitle}</div>

      <div className={`${cstyles.well} ${cstyles.margintopsmall}`} style={{ marginTop: 24 }}>
        <div className={cstyles.small} style={{ opacity: 0.6, marginBottom: 12 }}>
          Mainnet
        </div>
        <ExplorerRow
          label="Transactions"
          ariaLabel="Block explorer for mainnet transactions"
          customPlaceholder="https://mainnet.block-explorer/tx/"
          value={blockExplorerMainnetTransaction}
          onChange={setBlockExplorerMainnetTransaction}
          customValue={blockExplorerMainnetTransactionCustom}
          onCustomChange={setBlockExplorerMainnetTransactionCustom}
        />
        <ExplorerRow
          label="Addresses"
          ariaLabel="Block explorer for mainnet addresses"
          customPlaceholder="https://mainnet.block-explorer/address/"
          value={blockExplorerMainnetAddress}
          onChange={setBlockExplorerMainnetAddress}
          customValue={blockExplorerMainnetAddressCustom}
          onCustomChange={setBlockExplorerMainnetAddressCustom}
        />
      </div>

      <div className={cstyles.well} style={{ marginTop: 16 }}>
        <div className={cstyles.small} style={{ opacity: 0.6, marginBottom: 12 }}>
          Testnet
        </div>
        <ExplorerRow
          label="Transactions"
          ariaLabel="Block explorer for testnet transactions"
          customPlaceholder="https://testnet.block-explorer/tx/"
          value={blockExplorerTestnetTransaction}
          onChange={setBlockExplorerTestnetTransaction}
          customValue={blockExplorerTestnetTransactionCustom}
          onCustomChange={setBlockExplorerTestnetTransactionCustom}
        />
        <ExplorerRow
          label="Addresses"
          ariaLabel="Block explorer for testnet addresses"
          customPlaceholder="https://testnet.block-explorer/address/"
          value={blockExplorerTestnetAddress}
          onChange={setBlockExplorerTestnetAddress}
          customValue={blockExplorerTestnetAddressCustom}
          onCustomChange={setBlockExplorerTestnetAddressCustom}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
        <button type="button" className={cstyles.primarybutton} onClick={handleCancel}>
          Cancel
        </button>
        <button type="button" className={cstyles.primarybutton} onClick={handleSave} disabled={saveDisabled}>
          Save
        </button>
      </div>
    </Modal>
  );
};

export default BlockExplorerModal;
