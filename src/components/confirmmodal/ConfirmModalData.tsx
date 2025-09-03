export default class ConfirmModalData {
  title: string;
  body: string | JSX.Element;
  modalIsOpen: boolean;
  runAction:() => void;
  closeModal?: () => void;

  constructor() {
    this.modalIsOpen = false;
    this.title = "";
    this.body = "";
    this.runAction = () => {};
  }
}

