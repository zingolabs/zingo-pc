export default class ConfirmModalClass {
  title: string;
  body: string | JSX.Element;
  modalIsOpen: boolean;
  runAction: () => void;
  /**
   * A third way out, beside Cancel and Confirm, for a question that has one.
   *
   * Optional because most do not: a confirmation is usually yes or no, and a
   * dialog that invents a middle answer where there is none only makes the
   * two real ones harder to find. Absent, nothing is drawn and every existing
   * caller reads exactly as before.
   */
  alternate?: { label: string; action: () => void };

  constructor() {
    this.modalIsOpen = false;
    this.title = "";
    this.body = "";
    this.runAction = () => {};
  }
}
