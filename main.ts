// full tiny-stack ISA VM: every opcode, every trap, exact 32-bit wrap semantics (vm.mjs rules)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function run(p: Uint8Array, inp: Uint8Array): { out: number[]; code: number } {
  const D: number[] = [];
  const C: number[] = [];
  const M: number[] = new Array(256).fill(0);
  const out: number[] = [];
  let pc = 0, ip = 0, steps = 0, sp = 0, csp = 0;
  const trap = (c: number) => ({ out, code: c });
  for (;;) {
    if (steps === 1e6) return trap(10);
    if (pc < 0 || pc >= p.length) return trap(9);
    const op = p[pc];
    let imm = 0, pops = 0, pushes = 0;
    if (op === 0x01) { imm = 1; pushes = 1; }
    else if (op === 0x02) { imm = 4; pushes = 1; }
    else if (op === 0x03) pops = 1;
    else if (op === 0x04) { pops = 1; pushes = 2; }
    else if (op === 0x05 || op === 0x06) { pops = 2; pushes = op === 0x06 ? 3 : 2; }
    else if (op === 0x07) { pops = 3; pushes = 3; }
    else if (op === 0x17 || op === 0x1b) { pops = 1; pushes = 1; }
    else if (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b) { pops = 2; pushes = 1; }
    else if (op === 0x30) imm = 2;
    else if (op === 0x31 || op === 0x32) { imm = 2; pops = 1; }
    else if (op === 0x33) imm = 2;
    else if (op === 0x34) { /* pops handled below via csp */ }
    else if (op === 0x40) { pops = 1; pushes = 1; }
    else if (op === 0x41) pops = 2;
    else if (op === 0x50 || op === 0x51) pops = 1;
    else if (op === 0x52) pushes = 1;
    else if (op === 0x53) pops = 1;
    else if (op === 0x00) { /* HALT */ }
    else return trap(5);
    if (pc + imm >= p.length) return trap(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return trap(2);
    if (sp - pops + pushes > 256) return trap(3);
    if (op === 0x00) return { out, code: 0 };
    if (op === 0x01) { D[sp++] = (p[next - 1] << 24) >> 24; pc = next; continue; }
    if (op === 0x02) { D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); pc = next; continue; }
    if (op === 0x03) { sp--; pc = next; continue; }
    if (op === 0x04) { D[sp] = D[sp - 1]; sp++; pc = next; continue; }
    if (op === 0x05) { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; pc = next; continue; }
    if (op === 0x06) { D[sp] = D[sp - 2]; sp++; pc = next; continue; }
    if (op === 0x07) { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; pc = next; continue; }
    if (op === 0x17) { D[sp - 1] = -D[sp - 1] | 0; pc = next; continue; }
    if (op === 0x1b) { D[sp - 1] = ~D[sp - 1]; pc = next; continue; }
    if (op >= 0x10 && op <= 0x22) {
      const b = D[sp - 1], a = D[sp - 2];
      let r: number;
      if (op === 0x10) r = (a + b) | 0;
      else if (op === 0x11) r = (a - b) | 0;
      else if (op === 0x12) r = Math.imul(a, b);
      else if (op === 0x13) { if (b === 0) return trap(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
      else if (op === 0x14) { if (b === 0) return trap(4); r = b === -1 ? 0 : a % b | 0; }
      else if (op === 0x15) { if (b === 0) return trap(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
      else if (op === 0x16) { if (b === 0) return trap(4); r = (a >>> 0) % (b >>> 0) | 0; }
      else if (op === 0x18) r = a & b;
      else if (op === 0x19) r = a | b;
      else if (op === 0x1a) r = a ^ b;
      else if (op === 0x1c) r = a << (b & 31);
      else if (op === 0x1d) r = a >> (b & 31);
      else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
      else if (op === 0x20) r = a === b ? 1 : 0;
      else if (op === 0x21) r = a < b ? 1 : 0;
      else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      sp -= 2; D[sp++] = r; pc = next; continue;
    }
    if (op === 0x30 || op === 0x31 || op === 0x32) {
      const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
      let take = true;
      if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
      pc = take ? next + rel : next; continue;
    }
    if (op === 0x33) { if (csp === 64) return trap(7); C[csp++] = next; pc = p[next - 2] | (p[next - 1] << 8); continue; }
    if (op === 0x34) { if (csp === 0) return trap(8); pc = C[--csp]; continue; }
    if (op === 0x40) { const addr = D[sp - 1]; if (addr < 0 || addr > 255) return trap(6); D[sp - 1] = M[addr]; pc = next; continue; }
    if (op === 0x41) { const addr = D[sp - 1]; if (addr < 0 || addr > 255) return trap(6); sp -= 2; M[addr] = D[sp]; pc = next; continue; }
    if (op === 0x50) {
      const s = String(D[sp - 1]);
      let len = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); len += c < 128 ? 1 : 2; }
      if (out.length + len > 65536) return trap(11);
      for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 128) out.push(c); else { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); } }
      sp--; pc = next; continue;
    }
    if (op === 0x51) { if (out.length + 1 > 65536) return trap(11); out.push(D[--sp] & 255); pc = next; continue; }
    if (op === 0x52) { D[sp++] = ip < inp.length ? inp[ip++] : -1; pc = next; continue; }
    if (op === 0x53) return { out, code: D[--sp] & 255 };
    return trap(5);
  }
}

// driver: one pass over /input, answers to /output (format per RULES.txt)
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), Uint8Array.from(r.out));
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}