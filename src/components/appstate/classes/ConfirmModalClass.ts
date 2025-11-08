export default class ConfirmModalClass {
  title: string;
  body: string | JSX.Element;
  modalIsOpen: boolean;
  runAction:() => void;

  constructor() {
    this.modalIsOpen = false;
    this.title = "";
    this.body = "";
    this.runAction = () => {};
  }
}

