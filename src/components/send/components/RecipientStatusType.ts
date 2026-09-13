import { AddressKindEnum } from "../../appstate";

/**
 * What a recipient row reports up to the Send screen.
 *
 * The row validates itself, since it is the one resolving the address. The
 * screen needs the verdict to know whether the batch can be quoted, and the
 * address kind to warn when one transaction would link transparent recipients.
 */
type RecipientStatusType = {
  valid: boolean;
  addressKind?: AddressKindEnum;
};

export default RecipientStatusType;
