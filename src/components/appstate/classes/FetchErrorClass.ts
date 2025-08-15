export default class FetchErrorClass {
  command: string;
  error: string;

  constructor(command: string, error: string) {
    this.command = command;
    this.error = error;
  }
}
