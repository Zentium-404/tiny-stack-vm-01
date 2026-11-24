# tiny-stack-vm

Full ISA-1 VM for make.fun's tiny stack machine: every opcode, all 11 traps, exact 32-bit wrap semantics.

## Build

Node 22 (native TS strip). No dependencies.

## Run

```
mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Practice

40/40 on the kit's practice set (stdout bytes + exit codes byte-identical to the reference manifest).
