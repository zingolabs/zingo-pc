// Reads the CPU architecture out of a Windows PE file (.exe, .dll, .node).
//
// Shared by stage-vcruntime.js and check-win-arch.js so the two cannot drift:
// one decides what to ship, the other refuses to package if it is wrong, and
// both have to agree on what "arm64" means.

const fs = require("fs");

// PE layout: a 4-byte offset at 0x3c points at "PE\0\0", and the 2-byte Machine
// field follows it.
const MACHINE = { 0x8664: "x64", 0xaa64: "arm64", 0x14c: "ia32" };

function peArch(file) {
  const fd = fs.openSync(file, "r");
  try {
    const offset = Buffer.alloc(4);
    fs.readSync(fd, offset, 0, 4, 0x3c);
    const machine = Buffer.alloc(2);
    fs.readSync(fd, machine, 0, 2, offset.readUInt32LE(0) + 4);
    const value = machine.readUInt16LE(0);
    return MACHINE[value] || `unknown (0x${value.toString(16)})`;
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { peArch, ARCHITECTURES: Object.values(MACHINE) };
