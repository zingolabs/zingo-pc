export default class ErrorModalData {
  title: string;
  body: string | JSX.Element;
  modalIsOpen: boolean;
  closeModal?: () => void;

  constructor() {
    this.modalIsOpen = false;
    this.title = "";
    this.body = "";
  }
}

