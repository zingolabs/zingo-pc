import React, { PureComponent } from "react";
import Modal from "react-modal";
import cstyles from "./Common.module.css";

type PasswordModalProps = {
  modalIsOpen: boolean;
  confirmNeeded: boolean;
  passwordCallback: (password: string) => void;
  closeCallback: () => void;
  helpText?: string | JSX.Element;
};

type PasswordModalState = {
  password: string;
  confirmPassword: string;
};

export default class PasswordModal extends PureComponent<PasswordModalProps, PasswordModalState> {
  constructor(props: PasswordModalProps) {
    super(props);

    this.state = { password: "", confirmPassword: "" };
  }

  enterButton = () => {
    const { passwordCallback } = this.props;
    const { password } = this.state;

    passwordCallback(password);

    // Clear the passwords
    this.setState({ password: "", confirmPassword: "" });
  };

  closeButton = () => {
    const { closeCallback } = this.props;

    closeCallback();

    // Clear the passwords
    this.setState({ password: "", confirmPassword: "" });
  };

  render() {
    const { modalIsOpen, confirmNeeded, helpText } = this.props;
    const { password, confirmPassword } = this.state;

    const enabled = !confirmNeeded || password === confirmPassword;

    return (
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={this.closeButton}
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
              onChange={(e) => this.setState({ password: e.target.value })}
            />

            {confirmNeeded && (
              <div>
                <div className={cstyles.sublight}>Confirm Password</div>
                <input
                  type="password"
                  className={[cstyles.inputbox, cstyles.marginbottomlarge].join(" ")}
                  value={confirmPassword}
                  onChange={(e) => this.setState({ confirmPassword: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className={cstyles.buttoncontainer}>
            {!enabled && <div className={[cstyles.red].join(" ")}>Passwords do not match</div>}
            <button
              type="button"
              className={[cstyles.primarybutton, cstyles.margintoplarge].join(" ")}
              onClick={this.enterButton}
              disabled={!enabled}
            >
              Enter
            </button>

            <button type="button" className={cstyles.primarybutton} onClick={this.closeButton}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    );
  }
}
