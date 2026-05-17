import Modal from "react-modal";
import cstyles from "../../common/Common.module.css";
import { BlockExplorerEnum } from "../../appstate";
import { useState } from "react";
import { ipcRenderer } from "../../../electronBridge";
import ExplorerRow from "./ExplorerRow";

type BlockExplorerModalProps = {
  modalIsOpen: boolean;
  modalInput?: any;
  setModalInput: (be: any) => void;
  closeModal: () => void;
  modalTitle: string;
};

const normalizeCustom = (selected: BlockExplorerEnum, value: string) => {
  if (selected !== BlockExplorerEnum.Custom) return "";
  return value.endsWith("/") || value.endsWith("=") ? value : `${value}/`;
};

const BlockExplorerModal = ({
  modalIsOpen,
  modalInput,
  setModalInput,
  closeModal,
  modalTitle,
}: BlockExplorerModalProps) => {
  const [blockExplorerMainnetTransaction, setBlockExplorerMainnetTransaction] = useState<BlockExplorerEnum>(
    modalInput.blockExplorerMainnetTransaction,
  );
  const [blockExplorerTestnetTransaction, setBlockExplorerTestnetTransaction] = useState<BlockExplorerEnum>(
    modalInput.blockExplorerTestnetTransaction,
  );
  const [blockExplorerMainnetAddress, setBlockExplorerMainnetAddress] = useState<BlockExplorerEnum>(
    modalInput.blockExplorerMainnetAddress,
  );
  const [blockExplorerTestnetAddress, setBlockExplorerTestnetAddress] = useState<BlockExplorerEnum>(
    modalInput.blockExplorerTestnetAddress,
  );
  const [blockExplorerMainnetTransactionCustom, setBlockExplorerMainnetTransactionCustom] = useState<string>(
    modalInput.blockExplorerMainnetTransactionCustom,
  );
  const [blockExplorerTestnetTransactionCustom, setBlockExplorerTestnetTransactionCustom] = useState<string>(
    modalInput.blockExplorerTestnetTransactionCustom,
  );
  const [blockExplorerMainnetAddressCustom, setBlockExplorerMainnetAddressCustom] = useState<string>(
    modalInput.blockExplorerMainnetAddressCustom,
  );
  const [blockExplorerTestnetAddressCustom, setBlockExplorerTestnetAddressCustom] = useState<string>(
    modalInput.blockExplorerTestnetAddressCustom,
  );

  const handleCancel = () => {
    setBlockExplorerMainnetAddress(modalInput.blockExplorerMainnetAddress);
    setBlockExplorerMainnetAddressCustom(modalInput.blockExplorerMainnetAddressCustom);
    setBlockExplorerMainnetTransaction(modalInput.blockExplorerMainnetTransaction);
    setBlockExplorerMainnetTransactionCustom(modalInput.blockExplorerMainnetTransactionCustom);
    setBlockExplorerTestnetAddress(modalInput.blockExplorerTestnetAddress);
    setBlockExplorerTestnetAddressCustom(modalInput.blockExplorerTestnetAddressCustom);
    setBlockExplorerTestnetTransaction(modalInput.blockExplorerTestnetTransaction);
    setBlockExplorerTestnetTransactionCustom(modalInput.blockExplorerTestnetTransactionCustom);
    closeModal();
  };

  const handleSave = async () => {
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
    setBlockExplorerMainnetAddressCustom(toSave.blockExplorerMainnetAddressCustom);
    setBlockExplorerMainnetTransactionCustom(toSave.blockExplorerMainnetTransactionCustom);
    setBlockExplorerTestnetAddressCustom(toSave.blockExplorerTestnetAddressCustom);
    setBlockExplorerTestnetTransactionCustom(toSave.blockExplorerTestnetTransactionCustom);
    setModalInput(toSave);
    await ipcRenderer.invoke("saveSettings", { key: "blockexplorer", value: toSave });
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
