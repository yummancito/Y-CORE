// Round-10 follow-up — Round-9 patcher dropped the success-return-object close
// brace inside removeGameDrm. Insert the missing `    }` between line 288
// (`exePath,` last field) and line 290 (the close brace of removeGameDrm
// itself). Also remove the orphan `}` I appended at end of file last turn.

import fs from 'node:fs'

const file = 'electron/modules/drm-remover.ts'
const isCRLF = fs.readFileSync(file, 'utf8').includes('\r\n')
const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

// 1. Insert `    }` between the success-path '      exePath,' and the function-close.
const before = `      exePath,
   
}
`
const after = `      exePath,
    }
}
`
const beforeCount = raw.split(before).length - 1
if (beforeCount !== 1) {
  console.error(`FAIL — expected exactly 1 occurrence of "      exePath,\\n   \\n}". found: ${beforeCount}`)
  process.exit(1)
}
const patched = raw.replace(before, after)

// 2. Trim the orphan `}` and preceding blank line at end of file, if present.
const tail = /\n\}\n*$/
if (tail.test(patched)) {
  // drop those last two lines only if they're the orphan (i.e., registerDrmHandlers
  // already closed itself earlier on a line ending in `}` and we're left with
  // a final `}\n`). Detect: walk back to find the previous top-level `}`.
  // Simpler: count consecutive trailing `}\n\n` lines; remove only one pair.
  const trailing = patched.match(/(\n\}\n)+$/)
  if (trailing && trailing[0].split('\n}\n').length - 1 >= 2) {
    // The very last `}\n` is orphan; keep the rest.
    const cut = trailing[0].replace(/\n\}\n$/, '\n')
    const finalText = patched.slice(0, patched.length - trailing[0].length) + cut
    fs.writeFileSync(
      file,
      isCRLF ? finalText.replace(/\n/g, '\r\n') : finalText,
      'utf8',
    )
    console.log('OK  electron/modules/drm-remover.ts :: orphan trailing `}` removed')
  } else {
    fs.writeFileSync(
      file,
      isCRLF ? patched.replace(/\n/g, '\r\n') : patched,
      'utf8',
    )
    console.log('OK  electron/modules/drm-remover.ts :: only one trailing `}` — kept')
  }
} else {
  fs.writeFileSync(
    file,
    isCRLF ? patched.replace(/\n/g, '\r\n') : patched,
    'utf8',
  )
  console.log('OK  electron/modules/drm-remover.ts :: no trailing orphan detected, just inserted close brace')
}

// Verify
const final = fs.readFileSync(file, 'utf8')
const opens = (final.match(/\{/g) || []).length
const closes = (final.match(/\}/g) || []).length
console.log(`Final brace count: Opens=${opens}  Closes=${closes}`)
console.log(`Final line count: ${final.split(/\r?\n/).length - 1}`)
