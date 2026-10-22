import { birthdayAdjustedNotice } from "./birthdayAdjustedNotice";

describe("birthdayAdjustedNotice", () => {
  it("says the birthday was raised to Sapling activation, from where", () => {
    const notice = birthdayAdjustedNotice({ birthday: 419200, birthday_adjusted_from: 0 });
    expect(notice).toContain("was 0, before Sapling activated at 419200");
    expect(notice).toContain("syncs normally");
  });

  it("says nothing when zingolib did not raise it", () => {
    expect(birthdayAdjustedNotice({ birthday: 2_500_000 })).toBeNull();
    expect(birthdayAdjustedNotice({})).toBeNull();
  });
});
