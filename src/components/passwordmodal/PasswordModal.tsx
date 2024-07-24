import React, { useContext, useState } from "react";
import Modal from "react-modal";
import cstyles from "../common/Common.module.css";
import { ContextApp } from "../../context/ContextAppState";

type PasswordModalProps = {};

const PasswordModal: React.FC<PasswordModalProps> = () => {
  const context = useContext(ContextApp);
  const { passwordState } = context;

  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const { showPassword, confirmNeeded, helpText } = passwordState;
  const enabled: boolean = !confirmNeeded || password === confirmPassword;

  const enterButton = () => {
    const { passwordCallback } = passwordState;

    passwordCallback(password);

    // Clear the passwords
    setPassword("");
    setConfirmPassword("");
  };

  const closeButton = () => {
    const { closeCallback } = passwordState;

    closeCallback();

    // Clear the passwords
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <Modal
      isOpen={showPassword}
      onRequestClose={closeButton}
      className={cstyles.modal}
      overlayClassName={cstyles.modalOverlay}
    >
      <div className={[cstyles.verticalflex].join(" ")}>
        <div className={cstyles.marginbottomlarge} style={{ textAlign: "left" }}>
          {helpText && <span>{helpText}</span>}
          {!helpText && <span>Enter Wallet Password</span>}
        </div>

        <div className={cstyles.well} style={{ textAlign: "left" }}>
          <div className={cstyles.sublight}>Password</div>
          <input
            type="password"
            className={[cstyles.inputbox, cstyles.marginbottomlarge].join(" ")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {confirmNeeded && (
            <div>
              <div className={cstyles.sublight}>Confirm Password</div>
              <input
                type="password"
                className={[cstyles.inputbox, cstyles.marginbottomlarge].join(" ")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className={cstyles.buttoncontainer}>
          {!enabled && <div className={[cstyles.red].join(" ")}>Passwords do not match</div>}
          <button
            type="button"
            className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")}
            onClick={enterButton}
            disabled={!enabled}
          >
            Enter
          </button>

          <button type="button" className={cstyles.primarybutton} onClick={closeButton}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PasswordModal;
