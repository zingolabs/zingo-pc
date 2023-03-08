export default class PasswordState {
    showPassword: boolean;
  
    confirmNeeded: boolean;
  
    passwordCallback: (password: string) => void;
  
    closeCallback: () => void;
  
    helpText?: string | JSX.Element;
  
    constructor() {
      this.showPassword = false;
      this.confirmNeeded = false;
      this.passwordCallback = (p) => {};
      this.closeCallback = () => {};
      this.helpText = undefined;
    }
  }
  