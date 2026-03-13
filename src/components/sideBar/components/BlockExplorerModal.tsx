import Modal from "react-modal";
import cstyles from "../../common/Common.module.css";
import { BlockExplorerEnum } from "../../appstate";
import { useState } from "react";
const { ipcRenderer } = window.require("electron");

type BlockExplorerModalProps = {
  modalIsOpen: boolean;
  modalInput?: any;
  setModalInput: (be: any) => void;
  closeModal: () => void;
  modalTitle: string;
};

const BlockExplorerModal = ({
  modalIsOpen,
  modalInput,
  setModalInput,
  closeModal,
  modalTitle,
}: BlockExplorerModalProps) => {
    const [blockExplorerMainnetTransaction, setBlockExplorerMainnetTransaction] = useState<BlockExplorerEnum>(modalInput.blockExplorerMainnetTransaction);
    const [blockExplorerTestnetTransaction, setBlockExplorerTestnetTransaction] = useState<BlockExplorerEnum>(modalInput.blockExplorerTestnetTransaction);
    const [blockExplorerMainnetAddress, setBlockExplorerMainnetAddress] = useState<BlockExplorerEnum>(modalInput.blockExplorerMainnetAddress);
    const [blockExplorerTestnetAddress, setBlockExplorerTestnetAddress] = useState<BlockExplorerEnum>(modalInput.blockExplorerTestnetAddress);;
    const [blockExplorerMainnetTransactionCustom, setBlockExplorerMainnetTransactionCustom] = useState<string>(modalInput.blockExplorerMainnetTransactionCustom);
    const [blockExplorerTestnetTransactionCustom, setBlockExplorerTestnetTransactionCustom] = useState<string>(modalInput.blockExplorerTestnetTransactionCustom);
    const [blockExplorerMainnetAddressCustom, setBlockExplorerMainnetAddressCustom] =  useState<string>(modalInput.blockExplorerMainnetAddressCustom);
    const [blockExplorerTestnetAddressCustom, setBlockExplorerTestnetAddressCustom] =  useState<string>(modalInput.blockExplorerTestnetAddressCustom);

  return (
    <Modal
      isOpen={modalIsOpen}
      onRequestClose={closeModal}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "center" }}>
          {modalTitle}
        </div>

        <div className={cstyles.well} style={{ textAlign: "center" }}> 

          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center', flexWrap: 'nowrap', justifyContent:'space-between' }}>
            <div style={{ minWidth: "300px" }} className={cstyles.sublight}>Block Explorer (MAINNET - Transactions)</div>
            <select
              className={cstyles.inputbox}
              style={{width: '60%', marginLeft: "20px", maxWidth: blockExplorerMainnetTransaction === BlockExplorerEnum.Custom ? "160px" : undefined }}
              value={blockExplorerMainnetTransaction}
              onChange={(e) => {
                setBlockExplorerMainnetTransaction(e.target.value as BlockExplorerEnum);
              }}
            >
              <option value="" disabled hidden>Select...</option> 
              <option value={BlockExplorerEnum.Zcashexplorer}>Zcash Explorer App</option>
              <option value={BlockExplorerEnum.Cipherscan}>Cipher Scan App</option> 
              <option value={BlockExplorerEnum.Zypherscan}>Zypher Scan Com</option>
              <option value={BlockExplorerEnum.Custom}>Custom</option>
            </select>
            {blockExplorerMainnetTransaction === BlockExplorerEnum.Custom && (
              <input
                style={{ marginLeft: "20px" }}
                placeholder={'https://mainnet.block-explorer/tx/'}
                type="text"
                className={cstyles.inputbox}
                value={blockExplorerMainnetTransactionCustom}
                onChange={(e) => setBlockExplorerMainnetTransactionCustom(e.target.value)}
              />
            )}
          </div>

          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center', flexWrap: 'nowrap', justifyContent:'space-between' }}>
            <div style={{ minWidth: "300px" }} className={cstyles.sublight}>Block Explorer (MAINNET - Addresses)</div>
            <select
              className={cstyles.inputbox}
              style={{width: '60%', marginLeft: "20px", maxWidth: blockExplorerMainnetAddress === BlockExplorerEnum.Custom ? "160px" : undefined }}
              value={blockExplorerMainnetAddress}
              onChange={(e) => {
                setBlockExplorerMainnetAddress(e.target.value as BlockExplorerEnum);
              }}
            >
              <option value="" disabled hidden>Select...</option> 
              <option value={BlockExplorerEnum.Zcashexplorer}>Zcash Explorer App</option>
              <option value={BlockExplorerEnum.Cipherscan}>Cipher Scan App</option> 
              <option value={BlockExplorerEnum.Zypherscan}>Zypher Scan Com</option>
              <option value={BlockExplorerEnum.Custom}>Custom</option>
            </select>
            {blockExplorerMainnetAddress === BlockExplorerEnum.Custom && (
              <input
                style={{ marginLeft: "20px" }}
                placeholder={'https://mainnet.block-explorer/address/'}
                type="text"
                className={cstyles.inputbox}
                value={blockExplorerMainnetAddressCustom}
                onChange={(e) => setBlockExplorerMainnetAddressCustom(e.target.value)}
              />
            )}
          </div>

        </div>
        <div style={{ height: "20px" }} />
        <div className={cstyles.well} style={{ textAlign: "center" }}> 

          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center', justifyContent:'space-between' }}>
            <div style={{ minWidth: "300px" }} className={cstyles.sublight}>Block Explorer (TESTNET - Transactions)</div>
            <select
              className={cstyles.inputbox}
              style={{width: '60%', marginLeft: "20px", maxWidth: blockExplorerTestnetTransaction === BlockExplorerEnum.Custom ? "160px" : undefined }}
              value={blockExplorerTestnetTransaction}
              onChange={(e) => {
                setBlockExplorerTestnetTransaction(e.target.value as BlockExplorerEnum);
              }}
            >
              <option value="" disabled hidden>Select...</option> 
              <option value={BlockExplorerEnum.Zcashexplorer}>Zcash Explorer App</option>
              <option value={BlockExplorerEnum.Cipherscan}>Cipher Scan App</option> 
              <option value={BlockExplorerEnum.Zypherscan}>Zypher Scan Com</option>
              <option value={BlockExplorerEnum.Custom}>Custom</option>
            </select>
            {blockExplorerTestnetTransaction === BlockExplorerEnum.Custom && (
              <input
                style={{ marginLeft: "20px" }}
                placeholder={'https://testnet.block-explorer/tx/'}
                type="text"
                className={cstyles.inputbox}
                value={blockExplorerTestnetTransactionCustom}
                onChange={(e) => setBlockExplorerTestnetTransactionCustom(e.target.value)}
              />
            )}
          </div>

          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center', flexWrap: 'nowrap', justifyContent:'space-between' }}>
            <div style={{ minWidth: "300px" }} className={cstyles.sublight}>Block Explorer (TESTNET - Addresses)</div>
            <select
              className={cstyles.inputbox}
              style={{width: '60%', marginLeft: "20px", maxWidth: blockExplorerTestnetAddress === BlockExplorerEnum.Custom ? "160px" : undefined }}
              value={blockExplorerTestnetAddress}
              onChange={(e) => {
                setBlockExplorerTestnetAddress(e.target.value as BlockExplorerEnum);
              }}
            >
              <option value="" disabled hidden>Select...</option> 
              <option value={BlockExplorerEnum.Zcashexplorer}>Zcash Explorer App</option>
              <option value={BlockExplorerEnum.Cipherscan}>Cipher Scan App</option> 
              <option value={BlockExplorerEnum.Zypherscan}>Zypher Scan Com</option>
              <option value={BlockExplorerEnum.Custom}>Custom</option>
            </select>
            {blockExplorerTestnetAddress === BlockExplorerEnum.Custom && (
              <input
                style={{ marginLeft: "20px" }}
                placeholder={'https://testnet.block-explorer/address/'}
                type="text"
                className={cstyles.inputbox}
                value={blockExplorerTestnetAddressCustom}
                onChange={(e) => setBlockExplorerTestnetAddressCustom(e.target.value)}
              />
            )}
          </div>

        </div>
      </div>

      <div className={cstyles.buttoncontainer}>
        <button type="button" className={cstyles.primarybutton} onClick={() => {
          setBlockExplorerMainnetAddress(modalInput.blockExplorerMainnetAddress);
          setBlockExplorerMainnetAddressCustom(modalInput.blockExplorerMainnetAddressCustom);
          setBlockExplorerMainnetTransaction(modalInput.blockExplorerMainnetTransaction);
          setBlockExplorerMainnetTransactionCustom(modalInput.blockExplorerMainnetTransactionCustom);
          setBlockExplorerTestnetAddress(modalInput.blockExplorerTestnetAddress);
          setBlockExplorerTestnetAddressCustom(modalInput.blockExplorerTestnetAddressCustom);
          setBlockExplorerTestnetTransaction(modalInput.blockExplorerTestnetTransaction);
          setBlockExplorerTestnetTransactionCustom(modalInput.blockExplorerTestnetTransactionCustom);
          closeModal();
          }}>
          Close
        </button>
        <button 
          disabled={
            (blockExplorerMainnetAddress === BlockExplorerEnum.Custom && !blockExplorerMainnetAddressCustom) ||
            (blockExplorerMainnetTransaction === BlockExplorerEnum.Custom && !blockExplorerMainnetTransactionCustom) ||
            (blockExplorerTestnetAddress === BlockExplorerEnum.Custom && !blockExplorerTestnetAddressCustom) ||
            (blockExplorerTestnetTransaction === BlockExplorerEnum.Custom && !blockExplorerMainnetTransactionCustom)
          } 
          type="button" 
          className={cstyles.primarybutton} 
          onClick={async () => {
            setBlockExplorerMainnetAddressCustom(
              blockExplorerMainnetAddress === BlockExplorerEnum.Custom 
                ? (blockExplorerMainnetAddressCustom.endsWith('/') || blockExplorerMainnetAddressCustom.endsWith('=')
                  ? blockExplorerMainnetAddressCustom 
                  : `${blockExplorerMainnetAddressCustom}/`) 
                : ''
            );
            setBlockExplorerMainnetTransactionCustom(
              blockExplorerMainnetTransaction === BlockExplorerEnum.Custom 
                ? (blockExplorerMainnetTransactionCustom.endsWith('/') || blockExplorerMainnetTransactionCustom.endsWith('=') 
                  ? blockExplorerMainnetTransactionCustom 
                  : `${blockExplorerMainnetTransactionCustom}/`) 
                : ''
            );
            setBlockExplorerTestnetAddressCustom(
              blockExplorerTestnetAddress === BlockExplorerEnum.Custom 
                ? (blockExplorerTestnetAddressCustom.endsWith('/') || blockExplorerTestnetAddressCustom.endsWith('=') 
                  ? blockExplorerTestnetAddressCustom 
                  : `${blockExplorerTestnetAddressCustom}/`) 
                : ''
            );
            setBlockExplorerTestnetTransactionCustom(
              blockExplorerTestnetTransaction === BlockExplorerEnum.Custom 
                ? (blockExplorerTestnetTransactionCustom.endsWith('/') || blockExplorerTestnetTransactionCustom.endsWith('=') 
                  ? blockExplorerTestnetTransactionCustom 
                  : `${blockExplorerTestnetTransactionCustom}/`) 
                : ''
            );
            const toSave = {
              blockExplorerMainnetAddress,
              blockExplorerMainnetAddressCustom: 
                blockExplorerMainnetAddress === BlockExplorerEnum.Custom 
                  ? (blockExplorerMainnetAddressCustom.endsWith('/') || blockExplorerMainnetAddressCustom.endsWith('=') 
                    ? blockExplorerMainnetAddressCustom 
                    : `${blockExplorerMainnetAddressCustom}/`) 
                  : '',
              blockExplorerMainnetTransaction,
              blockExplorerMainnetTransactionCustom: 
                blockExplorerMainnetTransaction === BlockExplorerEnum.Custom 
                  ? (blockExplorerMainnetTransactionCustom.endsWith('/') || blockExplorerMainnetTransactionCustom.endsWith('=') 
                    ? blockExplorerMainnetTransactionCustom 
                    : `${blockExplorerMainnetTransactionCustom}/`) 
                  : '',
              blockExplorerTestnetAddress,
              blockExplorerTestnetAddressCustom: 
                blockExplorerTestnetAddress === BlockExplorerEnum.Custom 
                  ? (blockExplorerTestnetAddressCustom.endsWith('/') || blockExplorerTestnetAddressCustom.endsWith('=') 
                    ? blockExplorerTestnetAddressCustom 
                    : `${blockExplorerTestnetAddressCustom}/`) 
                  : '',
              blockExplorerTestnetTransaction,
              blockExplorerTestnetTransactionCustom: 
                blockExplorerTestnetTransaction === BlockExplorerEnum.Custom 
                  ? (blockExplorerTestnetTransactionCustom.endsWith('/') || blockExplorerTestnetTransactionCustom.endsWith('=') 
                    ? blockExplorerTestnetTransactionCustom 
                    : `${blockExplorerTestnetTransactionCustom}/`) 
                  : '',
            };
            setModalInput(toSave);
            await ipcRenderer.invoke("saveSettings", { key: "blockexplorer", value: toSave });
            closeModal();
        }}>
          Save
        </button>
      </div>
    </Modal>
  );
};

export default BlockExplorerModal;